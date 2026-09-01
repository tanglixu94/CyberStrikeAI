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
            writeU16(localView, 6, 0x0800);
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
            writeU16(centralView, 8, 0x0800);
            writeU16(centralView, 10, 0);
            writeU16(centralView, 12, 0);
            writeU16(centralView, 14, 0);
            writeU32(centralView, 16, crc);
            writeU32(centralView, 20, data.length);
            writeU32(centralView, 24, data.length);
            writeU16(centralView, 26, nameBytes.length);
            writeU16(centralView, 28, 0);
            writeU16(centralView, 30, 0);
            writeU16(centralView, 32, 0);
            writeU16(centralView, 34, 0);
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

    function escapeXml(text) {
        return String(text)
            .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
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
        var rPr = '';
        if (opts.bold || opts.size || opts.mono) {
            rPr = '<w:rPr>';
            if (opts.mono) {
                rPr += '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="宋体"/>';
            } else {
                rPr += '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="微软雅黑"/>';
            }
            if (opts.bold) rPr += '<w:b/>';
            if (opts.size) rPr += '<w:sz w:val="' + opts.size + '"/><w:szCs w:val="' + opts.size + '"/>';
            rPr += '</w:rPr>';
        }
        var xml = '';
        for (var c = 0; c < chunks.length; c++) {
            xml += '<w:r>' + rPr + '<w:t xml:space="preserve">' + escapeXml(chunks[c]) + '</w:t></w:r>';
        }
        return xml;
    }

    function paragraph(text, opts) {
        opts = opts || {};
        var pPr = '<w:pPr>';
        if (opts.spacingAfter) {
            pPr += '<w:spacing w:after="' + opts.spacingAfter + '"/>';
        }
        if (opts.shading) {
            pPr += '<w:shd w:val="clear" w:fill="' + opts.shading + '"/>';
        }
        pPr += '</w:pPr>';
        return '<w:p>' + pPr + textRun(text, opts) + '</w:p>';
    }

    function markdownToDocumentXml(markdown) {
        var lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
        var body = [];
        var inCode = false;
        var codeLines = [];
        var i;
        for (i = 0; i < lines.length; i++) {
            var line = lines[i];
            if (line.trim().indexOf('```') === 0) {
                if (inCode) {
                    body.push(paragraph(codeLines.join('\n') || ' ', { mono: true, size: 18, shading: 'F4F4F5', spacingAfter: 120 }));
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
            if (!line.trim() || /^---+$/.test(line.trim())) {
                continue;
            }
            var heading = /^(#{1,6})\s+(.*)$/.exec(line);
            if (heading) {
                var level = heading[1].length;
                var size = level === 1 ? 36 : (level === 2 ? 28 : 24);
                body.push(paragraph(heading[2], { bold: true, size: size, spacingAfter: 160 }));
                continue;
            }
            if (/^\s*[-*]\s+/.test(line)) {
                body.push(paragraph('• ' + line.replace(/^\s*[-*]\s+/, ''), { size: 21, spacingAfter: 80 }));
                continue;
            }
            body.push(paragraph(line.replace(/^>\s?/, ''), { size: 21, spacingAfter: 120 }));
        }
        if (inCode) {
            body.push(paragraph(codeLines.join('\n') || ' ', { mono: true, size: 18, shading: 'F4F4F5' }));
        }
        if (body.length === 0) {
            body.push(paragraph('（无内容）', { size: 21 }));
        }
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
            '<w:body>' + body.join('') +
            '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708"/></w:sectPr>' +
            '</w:body></w:document>';
    }

    function contentTypesXml() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
            '</Types>';
    }

    function relsXml() {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
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

    function buildDocxBytesFromMarkdown(markdown) {
        return zipStore([
            { name: '[Content_Types].xml', data: encodeUtf8(contentTypesXml()) },
            { name: '_rels/.rels', data: encodeUtf8(relsXml()) },
            { name: 'word/document.xml', data: encodeUtf8(markdownToDocumentXml(markdown)) }
        ]);
    }

    function buildDocxBlobFromMarkdown(markdown) {
        var bytes = buildDocxBytesFromMarkdown(markdown);
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
