const test = require('node:test');
const assert = require('node:assert/strict');
const { TextDecoder } = require('node:util');

const docx = require('./conversation-docx.js');

test('Word 文件名使用对话标题，不含对话 ID', () => {
    const name = docx.buildConversationWordFileName({
        id: 'conv_a1b2c3d4e5f6',
        title: '扫描 192.168.1.1 开放端口',
    });
    assert.equal(name, '扫描_192.168.1.1_开放端口_报告.docx');
    assert.equal(name.includes('a1b2c3d4'), false);
    assert.equal(name.includes('conv_'), false);
});

test('Word 文件名会去掉非法字符并在空标题时使用可读回退名', () => {
    assert.equal(
        docx.buildConversationWordFileName({ title: 'a/b:c*d?.docx' }),
        'a_b_c_d_报告.docx'
    );
    assert.equal(docx.buildConversationWordFileName({}), '对话报告.docx');
    assert.equal(docx.buildConversationWordFileName(null), '对话报告.docx');
});

test('完整版 Markdown 会打进 docx 且 zip 头合法', () => {
    const markdown = '# 扫描报告\n\n- Conversation ID: `abc123`\n\n## Assistant\n\n发现 80 端口开放。\n\n```json\n{"port":80}\n```\n';
    const bytes = docx.buildDocxBytesFromMarkdown(markdown);
    assert.ok(bytes instanceof Uint8Array);
    assert.ok(bytes.length > 100);
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b);

    const xml = extractZipText(bytes, 'word/document.xml');
    assert.match(xml, /扫描报告/);
    assert.match(xml, /发现 80 端口开放/);
    assert.match(xml, /&quot;port&quot;:80|&quot;port&quot;: 80|"port":80/);
});

test('ZIP 中央目录文件名长度正确，可被标准 zip 解析', () => {
    const bytes = docx.buildDocxBytesFromMarkdown('# 标题\n\n正文');
    const cd = parseCentralDirectory(bytes);
    assert.equal(cd.length, 5);
    assert.deepEqual(cd.map((e) => e.name).sort(), [
        '[Content_Types].xml',
        '_rels/.rels',
        'word/_rels/document.xml.rels',
        'word/document.xml',
        'word/styles.xml',
    ].sort());
    assert.ok(cd.every((e) => e.nameLen > 0));
});

test('document.xml 的 w:t 不含换行（Word 无法读取含换行的文本节点）', () => {
    const markdown = '```json\n{"a":1}\n{"b":2}\n```\n';
    const bytes = docx.buildDocxBytesFromMarkdown(markdown);
    const xml = extractZipText(bytes, 'word/document.xml');
    assert.doesNotMatch(xml, /<w:t[^>]*>[^<]*\n[^<]*<\/w:t>/);
    assert.match(xml, /\{&quot;a&quot;:1\}/);
});

test('首页封面使用动态目标与日期，并分页后再输出正文', () => {
    const conversation = {
        title: '登录页排查',
        createdAt: '2026-09-01T08:00:00+08:00',
        messages: [{ role: 'user', content: '对 http://221.226.65.58:23000/staragent/login 进行测试' }],
    };
    const bytes = docx.buildDocxBytesFromMarkdown('# 登录页排查\n\n**高危** 发现 `xss`', conversation);
    const xml = extractZipText(bytes, 'word/document.xml');
    assert.match(xml, /渗透测试报告/);
    assert.match(xml, /Penetration Test Report/);
    assert.match(xml, /http:\/\/221\.226\.65\.58:23000\/staragent\/login 进行渗透测试/);
    assert.match(xml, /报告日期：2026-09-01/);
    assert.match(xml, /密级：内部资料/);
    assert.match(xml, /w:type="page"/);
    assert.match(xml, /w:val="Heading1"/);
    assert.match(xml, /<w:b\/>/);
});

test('docx 含 Word 标题样式定义', () => {
    const bytes = docx.buildDocxBytesFromMarkdown('# 标题', { title: '标题' });
    const styles = extractZipText(bytes, 'word/styles.xml');
    assert.match(styles, /w:styleId="Heading1"/);
    assert.match(styles, /w:styleId="Heading2"/);
    const cd = parseCentralDirectory(bytes);
    assert.equal(cd.some((e) => e.name === 'word/styles.xml'), true);
});

test('Markdown 表格会转成 Word 表格而不是管道原文', () => {
    const markdown = [
        '## 系统识别',
        '',
        '| 项目 | 信息 |',
        '|------|------|',
        '| 服务名称 | Wan2.2-TI2V-5B 视频生成服务 |',
        '| Web 服务器 | gunicorn |',
        '| 文件存储路径 | `/home/aigc/model/wan22/outputs/` |',
        '',
        '后续说明。',
    ].join('\n');
    const xml = extractZipText(docx.buildDocxBytesFromMarkdown(markdown), 'word/document.xml');
    assert.match(xml, /<w:tbl>/);
    assert.match(xml, /<w:tr>/);
    assert.match(xml, /<w:tc>/);
    assert.match(xml, /服务名称/);
    assert.match(xml, /Wan2\.2-TI2V-5B 视频生成服务/);
    assert.match(xml, /gunicorn/);
    assert.match(xml, /\/home\/aigc\/model\/wan22\/outputs\//);
    assert.doesNotMatch(xml, /\|------\|/);
    assert.doesNotMatch(xml, /\| 项目 \|/);
    assert.match(xml, /后续说明/);
});

function parseCentralDirectory(bytes) {
    const end = bytes.length - 22;
    assert.equal(bytes[end], 0x50);
    assert.equal(bytes[end + 1], 0x4b);
    assert.equal(bytes[end + 2], 0x05);
    assert.equal(bytes[end + 3], 0x06);
    const n = bytes[end + 8] | (bytes[end + 9] << 8);
    let off = bytes[end + 16] | (bytes[end + 17] << 8) | (bytes[end + 18] << 16) | (bytes[end + 19] << 24);
    const entries = [];
    for (let i = 0; i < n; i++) {
        assert.equal(bytes[off], 0x50);
        assert.equal(bytes[off + 1], 0x4b);
        assert.equal(bytes[off + 2], 0x01);
        assert.equal(bytes[off + 3], 0x02);
        const nameLen = bytes[off + 28] | (bytes[off + 29] << 8);
        const extraLen = bytes[off + 30] | (bytes[off + 31] << 8);
        const commentLen = bytes[off + 32] | (bytes[off + 33] << 8);
        const name = Buffer.from(bytes.subarray(off + 46, off + 46 + nameLen)).toString('utf8');
        entries.push({ name, nameLen });
        off += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
}

function extractZipText(bytes, fileName) {
    const nameBytes = Buffer.from(fileName, 'utf8');
    for (let i = 0; i < bytes.length - 30; i++) {
        if (bytes[i] !== 0x50 || bytes[i + 1] !== 0x4b || bytes[i + 2] !== 0x03 || bytes[i + 3] !== 0x04) {
            continue;
        }
        const nameLen = bytes[i + 26] | (bytes[i + 27] << 8);
        const extraLen = bytes[i + 28] | (bytes[i + 29] << 8);
        const uncompSize = bytes[i + 22] | (bytes[i + 23] << 8) | (bytes[i + 24] << 16) | (bytes[i + 25] << 24);
        const nameStart = i + 30;
        const foundName = Buffer.from(bytes.subarray(nameStart, nameStart + nameLen)).toString('utf8');
        if (foundName !== fileName) continue;
        const dataStart = nameStart + nameLen + extraLen;
        return new TextDecoder('utf-8').decode(bytes.subarray(dataStart, dataStart + uncompSize));
    }
    throw new Error('missing zip entry: ' + fileName);
}
