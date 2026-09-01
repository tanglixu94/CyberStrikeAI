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
