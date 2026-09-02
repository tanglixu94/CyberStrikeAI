(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ConversationDocx = factory();
    }
}(typeof window !== 'undefined' ? window : globalThis, function () {
    var CRC_TABLE = (function () {
        var table = new Uint32Array(256);
        for (var n = 0; n < 256; n++) {
            var c = n;
            for (var k = 0; k < 8; k++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[n] = c >>> 0;
        }
        return table;
    }());

    function crc32(u8) {
        var c = 0xFFFFFFFF;
        for (var i = 0; i < u8.length; i++) {
            c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
        }
        return (c ^ 0xFFFFFFFF) >>> 0;
    }

    function u8Concat(parts) {
        var total = 0;
        var i;
        for (i = 0; i < parts.length; i++) total += parts[i].length;
        var out = new Uint8Array(total);
        var offset = 0;
        for (i = 0; i < parts.length; i++) {
            out.set(parts[i], offset);
            offset += parts[i].length;
        }
        return out;
    }

    function encodeUtf8(str) {
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(str);
        }
        return Uint8Array.from(Buffer.from(str, 'utf8'));
    }

    function writeU16(view, offset, value) {
        view.setUint16(offset, value, true);
    }

    function writeU32(view, offset, value) {
        view.setUint32(offset, value, true);
    }

    function zipStore(files) {
        var encoder = encodeUtf8;
        var localParts = [];
        var centralParts = [];
        var offset = 0;
        var i;
        for (i = 0; i < files.length; i++) {
            var nameBytes = encoder(files[i].name);
            var data = files[i].data;
            var crc = crc32(data);
            var local = new Uint8Array(30 + nameBytes.length);
            var localView = new DataView(local.buffer);
            writeU32(localView, 0, 0x04034b50);
            writeU16(localView, 4, 20);
            writeU16(localView, 6, 0);
            writeU16(localView, 8, 0);
            writeU16(localView, 10, 0);
            writeU16(localView, 12, 0);
            writeU32(localView, 14, crc);
            writeU32(localView, 18, data.length);
            writeU32(localView, 22, data.length);
            writeU16(localView, 26, nameBytes.length);
            writeU16(localView, 28, 0);
            local.set(nameBytes, 30);

            var central = new Uint8Array(46 + nameBytes.length);
            var centralView = new DataView(central.buffer);
            writeU32(centralView, 0, 0x02014b50);
            writeU16(centralView, 4, 20);
            writeU16(centralView, 6, 20);
            writeU16(centralView, 8, 0);
            writeU16(centralView, 10, 0);
            writeU16(centralView, 12, 0);
            writeU16(centralView, 14, 0);
            writeU32(centralView, 16, crc);
            writeU32(centralView, 20, data.length);
            writeU32(centralView, 24, data.length);
            writeU16(centralView, 28, nameBytes.length);
            writeU16(centralView, 30, 0);
            writeU16(centralView, 32, 0);
            writeU16(centralView, 34, 0);
            writeU16(centralView, 36, 0);
            writeU32(centralView, 38, 0);
            writeU32(centralView, 42, offset);
            central.set(nameBytes, 46);

            localParts.push(local, data);
            centralParts.push(central);
            offset += local.length + data.length;
        }

        var centralDir = u8Concat(centralParts);
        var end = new Uint8Array(22);
        var endView = new DataView(end.buffer);
        writeU32(endView, 0, 0x06054b50);
        writeU16(endView, 4, 0);
        writeU16(endView, 6, 0);
        writeU16(endView, 8, files.length);
        writeU16(endView, 10, files.length);
        writeU32(endView, 12, centralDir.length);
        writeU32(endView, 16, offset);
        writeU16(endView, 20, 0);
        return u8Concat(localParts.concat([centralDir, end]));
    }

    function firstUserMessage(conversation) {
        var messages = conversation && conversation.messages;
        if (!Array.isArray(messages)) return '';
        var i;
        for (i = 0; i < messages.length; i++) {
            if (messages[i] && messages[i].role === 'user' && typeof messages[i].content === 'string') {
                return messages[i].content;
            }
        }
        return '';
    }

    function extractUrl(text) {
        var match = String(text || '').match(/https?:\/\/[^\s<>"'，。；、]+/i);
        if (!match) return '';
        return match[0].replace(/[),.;，。]+$/g, '');
    }

    function resolveReportSubject(conversation) {
        var title = String((conversation && conversation.title) || '').trim();
        var userText = firstUserMessage(conversation);
        return extractUrl(title) || extractUrl(userText) || title || '未指定目标';
    }

    function pad2(n) {
        return n < 10 ? '0' + n : String(n);
    }

    function formatReportDate(conversation) {
        var raw = conversation && (conversation.updatedAt || conversation.createdAt);
        var date = raw ? new Date(raw) : new Date();
        if (isNaN(date.getTime())) date = new Date();
        return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
    }

    function escapeXml(text) {
        return String(text)
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
            .replace(/\r\n/g, '\n')
            .replace(/[\r\n]/g, ' ')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function textRun(text, opts) {
        opts = opts || {};
        var chunks = [];
        var value = String(text);
        var i = 0;
        while (i < value.length) {
            chunks.push(value.slice(i, i + 4000));
            i += 4000;
        }
        if (chunks.length === 0) chunks.push('');
        var rPr = '<w:rPr>';
        if (opts.cover) {
            rPr += '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="宋体"/>';
        } else if (opts.mono) {
            rPr += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="宋体"/>';
        } else {
            rPr += '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="微软雅黑"/>';
        }
        if (opts.bold) rPr += '<w:b/>';
        if (opts.italic) rPr += '<w:i/>';
        if (opts.underline) rPr += '<w:u w:val="single"/>';
        if (opts.color) rPr += '<w:color w:val="' + opts.color + '"/>';
        if (opts.size) rPr += '<w:sz w:val="' + opts.size + '"/><w:szCs w:val="' + opts.size + '"/>';
        if (opts.shade) rPr += '<w:shd w:val="clear" w:fill="' + opts.shade + '"/>';
        rPr += '</w:rPr>';
        var xml = '';
        for (var c = 0; c < chunks.length; c++) {
            xml += '<w:r>' + rPr + '<w:t xml:space="preserve">' + escapeXml(chunks[c]) + '</w:t></w:r>';
        }
        return xml;
    }

    function mergeOpts(base, extra) {
        var out = {};
        var key;
        base = base || {};
        extra = extra || {};
        for (key in base) {
            if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key];
        }
        for (key in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, key)) out[key] = extra[key];
        }
        return out;
    }

    function inlineRuns(text, baseOpts) {
        var source = String(text || '');
        var re = /(`[^`]+`|\*\*[^*]+?\*\*|\*[^*\n]+?\*|\[[^\]]+\]\([^)]+\))/g;
        var xml = '';
        var last = 0;
        var match;
        while ((match = re.exec(source))) {
            if (match.index > last) xml += textRun(source.slice(last, match.index), baseOpts);
            var token = match[0];
            if (token.charAt(0) === '`') {
                xml += textRun(token.slice(1, -1), mergeOpts(baseOpts, { mono: true, shade: 'EEEEEE', size: 18 }));
            } else if (token.slice(0, 2) === '**') {
                xml += textRun(token.slice(2, -2), mergeOpts(baseOpts, { bold: true }));
            } else if (token.charAt(0) === '*') {
                xml += textRun(token.slice(1, -1), mergeOpts(baseOpts, { italic: true }));
            } else {
                var link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
                xml += textRun((link && link[1] ? link[1] : token) + (link && link[2] ? ' (' + link[2] + ')' : ''), mergeOpts(baseOpts, { color: '0563C1', underline: true }));
            }
            last = match.index + token.length;
        }
        if (last < source.length) xml += textRun(source.slice(last), baseOpts);
        if (!xml) xml += textRun(' ', baseOpts);
        return xml;
    }

    function paragraphRuns(runsXml, opts) {
        opts = opts || {};
        var pPr = '<w:pPr>';
        if (opts.style) pPr += '<w:pStyle w:val="' + opts.style + '"/>';
        if (opts.align) pPr += '<w:jc w:val="' + opts.align + '"/>';
        if (opts.spacingBefore || opts.spacingAfter) {
            pPr += '<w:spacing';
            if (opts.spacingBefore) pPr += ' w:before="' + opts.spacingBefore + '"';
            if (opts.spacingAfter) pPr += ' w:after="' + opts.spacingAfter + '"';
            pPr += '/>';
        }
        if (opts.indent) pPr += '<w:ind w:left="' + opts.indent + '"/>';
        if (opts.shading) pPr += '<w:shd w:val="clear" w:fill="' + opts.shading + '"/>';
        pPr += '</w:pPr>';
        return '<w:p>' + pPr + runsXml + '</w:p>';
    }

    function paragraph(text, opts) {
        opts = opts || {};
        if (opts.plain) return paragraphRuns(textRun(text, opts), opts);
        return paragraphRuns(inlineRuns(text, opts), opts);
    }

    function flushCodeLines(body, codeLines, closed) {
        if (codeLines.length === 0) {
            body.push(paragraph(' ', { plain: true, mono: true, size: 18, shading: 'F4F4F5', spacingAfter: closed ? 160 : 0 }));
            return;
        }
        var ci;
        for (ci = 0; ci < codeLines.length; ci++) {
            body.push(paragraph(codeLines[ci] === '' ? ' ' : codeLines[ci], {
                plain: true,
                mono: true,
                size: 18,
                shading: 'F4F4F5',
                spacingAfter: (closed && ci === codeLines.length - 1) ? 160 : 0
            }));
        }
    }

    function buildCoverXml(conversation) {
        var subject = resolveReportSubject(conversation);
        var date = formatReportDate(conversation);
        return [
            paragraph('渗透测试报告', { plain: true, cover: true, bold: true, size: 56, align: 'center', spacingBefore: 1800, spacingAfter: 200 }),
            paragraph('Penetration Test Report', { plain: true, cover: true, size: 24, align: 'center', spacingAfter: 2800 }),
            paragraph('《' + subject + ' 进行渗透测试》', { plain: true, cover: true, size: 22, align: 'center', spacingAfter: 5600 }),
            paragraph('报告日期：' + date, { plain: true, cover: true, size: 21, align: 'center', spacingAfter: 80 }),
            paragraph('密级：内部资料', { plain: true, cover: true, size: 21, align: 'center', spacingAfter: 200 }),
            '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
        ].join('');
    }

    function parseMdTableCells(line) {
        var trimmed = String(line || '').trim();
        if (!trimmed) return [];
        if (trimmed.charAt(0) === '|') trimmed = trimmed.slice(1);
        if (trimmed.charAt(trimmed.length - 1) === '|') trimmed = trimmed.slice(0, -1);
        return trimmed.split('|').map(function (cell) {
            return cell.trim();
        });
    }

    function isMdTableSeparator(line) {
        var cells = parseMdTableCells(line);
        if (cells.length < 2) return false;
        var i;
        for (i = 0; i < cells.length; i++) {
            if (!/^:?-{3,}:?$/.test(cells[i].replace(/\s/g, ''))) return false;
        }
        return true;
    }

    function looksLikeMdTableRow(line) {
        var trimmed = String(line || '').trim();
        if (trimmed.indexOf('|') < 0) return false;
        return parseMdTableCells(trimmed).length >= 2;
    }

    function tableBorder(tag) {
        return '<' + tag + ' w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>';
    }

    function tableCellXml(text, opts) {
        opts = opts || {};
        var tcPr = '<w:tcPr>';
        if (opts.width) tcPr += '<w:tcW w:w="' + opts.width + '" w:type="dxa"/>';
        tcPr += '<w:tcBorders>' +
            tableBorder('w:top') + tableBorder('w:left') + tableBorder('w:bottom') + tableBorder('w:right') +
            '</w:tcBorders>';
        if (opts.header) tcPr += '<w:shd w:val="clear" w:fill="1F4E79"/>';
        tcPr += '<w:vAlign w:val="center"/>';
        tcPr += '</w:tcPr>';
        var runOpts = opts.header
            ? { bold: true, color: 'FFFFFF', size: 20 }
            : { size: 20 };
        var p = paragraph(text || ' ', runOpts);
        return '<w:tc>' + tcPr + p + '</w:tc>';
    }

    function markdownTableXml(rows) {
        var colCount = 0;
        var r;
        for (r = 0; r < rows.length; r++) {
            if (rows[r].length > colCount) colCount = rows[r].length;
        }
        if (colCount < 1) return '';
        var usable = 9026;
        var colW = Math.max(1200, Math.floor(usable / colCount));
        var xml = '<w:tbl><w:tblPr><w:tblW w:w="' + (colW * colCount) + '" w:type="dxa"/>' +
            '<w:tblBorders>' +
            tableBorder('w:top') + tableBorder('w:left') + tableBorder('w:bottom') + tableBorder('w:right') +
            tableBorder('w:insideH') + tableBorder('w:insideV') +
            '</w:tblBorders></w:tblPr><w:tblGrid>';
        var c;
        for (c = 0; c < colCount; c++) {
            xml += '<w:gridCol w:w="' + colW + '"/>';
        }
        xml += '</w:tblGrid>';
        for (r = 0; r < rows.length; r++) {
            xml += '<w:tr>';
            for (c = 0; c < colCount; c++) {
                xml += tableCellXml(rows[r][c] || '', { header: r === 0, width: colW });
            }
            xml += '</w:tr>';
        }
        xml += '</w:tbl>';
        xml += paragraph(' ', { size: 10, spacingAfter: 80 });
        return xml;
    }

    function consumeMarkdownTable(lines, start) {
        if (!looksLikeMdTableRow(lines[start]) || !isMdTableSeparator(lines[start + 1] || '')) {
            return null;
        }
        var header = parseMdTableCells(lines[start]);
        var rows = [header];
        var i = start + 2;
        while (i < lines.length && looksLikeMdTableRow(lines[i]) && !isMdTableSeparator(lines[i])) {
            var cells = parseMdTableCells(lines[i]);
            while (cells.length < header.length) cells.push('');
            rows.push(cells);
            i += 1;
        }
        return { xml: markdownTableXml(rows), next: i };
    }

    function markdownToBodyXml(markdown) {
        var lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
        var body = [];
        var inCode = false;
        var codeLines = [];
        var i;
        for (i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.trim().indexOf('```') === 0) {
                if (inCode) {
                    flushCodeLines(body, codeLines, true);
                    codeLines = [];
                    inCode = false;
                } else {
                    inCode = true;
                }
                continue;
            }
            if (inCode) {
                codeLines.push(line);
                continue;
            }
            var table = consumeMarkdownTable(lines, i);
            if (table) {
                body.push(table.xml);
                i = table.next - 1;
                continue;
            }
            if (!line.trim() || /^---+$/.test(line.trim())) {
                continue;
            }
            var heading = /^(#{1,6})\s+(.*)$/.exec(line);
            if (heading) {
                var level = heading[1].length;
                var style = level === 1 ? 'Heading1' : (level === 2 ? 'Heading2' : 'Heading3');
                body.push(paragraph(heading[2], { style: style, spacingAfter: 160 }));
                continue;
            }
            if (/^\s*[-*]\s+/.test(line)) {
                body.push(paragraph('• ' + line.replace(/^\s*[-*]\s+/, ''), { size: 21, indent: 420, spacingAfter: 80 }));
                continue;
            }
            body.push(paragraph(line.replace(/^>\s?/, ''), { size: 21, spacingAfter: 140 }));
        }
        if (inCode) flushCodeLines(body, codeLines, true);
        if (body.length === 0) {
            body.push(paragraph('（无内容）', { size: 21 }));
        }
        return body.join('');
    }

    function markdownToDocumentXml(markdown, conversation) {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
            '<w:body>' + buildCoverXml(conversation) + markdownToBodyXml(markdown) +
            '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708"/></w:sectPr>' +
            '</w:body></w:document>';
    }

    function stylesXml() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
            '<w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="微软雅黑"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>' +
            '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/><w:spacing w:before="360" w:after="160"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/><w:color w:val="1F4E79"/></w:rPr></w:style>' +
            '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/><w:spacing w:before="280" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="2E75B6"/></w:rPr></w:style>' +
            '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="2"/><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/><w:color w:val="5B9BD5"/></w:rPr></w:style>' +
            '</w:styles>';
    }

    function contentTypesXml() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
            '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
            '</Types>';
    }

    function relsXml() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
            '</Relationships>';
    }

    function documentRelsXml() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
            '</Relationships>';
    }

    function sanitizeConversationFileTitle(title) {
        var text = String(title == null ? '' : title).trim()
            .replace(/\.docx$/i, '')
            .replace(/\.doc$/i, '')
            .replace(/\.md$/i, '')
            .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
            .replace(/\s+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 80);
        return text;
    }

    function buildConversationWordFileName(conversation) {
        var safe = sanitizeConversationFileTitle(conversation && conversation.title);
        if (!safe) return '对话报告.docx';
        if (/报告$/.test(safe) || /report$/i.test(safe)) return safe + '.docx';
        return safe + '_报告.docx';
    }

    function buildDocxBytesFromMarkdown(markdown, conversation) {
        return zipStore([
            { name: '[Content_Types].xml', data: encodeUtf8(contentTypesXml()) },
            { name: '_rels/.rels', data: encodeUtf8(relsXml()) },
            { name: 'word/_rels/document.xml.rels', data: encodeUtf8(documentRelsXml()) },
            { name: 'word/styles.xml', data: encodeUtf8(stylesXml()) },
            { name: 'word/document.xml', data: encodeUtf8(markdownToDocumentXml(markdown, conversation)) }
        ]);
    }

    function buildDocxBlobFromMarkdown(markdown, conversation) {
        var bytes = buildDocxBytesFromMarkdown(markdown, conversation);
        return new Blob([bytes], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
    }

    return {
        buildConversationWordFileName: buildConversationWordFileName,
        buildDocxBytesFromMarkdown: buildDocxBytesFromMarkdown,
        buildDocxBlobFromMarkdown: buildDocxBlobFromMarkdown
    };
}));
