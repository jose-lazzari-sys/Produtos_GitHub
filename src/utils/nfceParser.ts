import { classifyProduct } from './classifier';
import { NFCeItem, NFCeReceipt } from '../types';
import { generateUniqueId } from './storage';
import { extractPesoKg, calculatePrecoPorKg } from './weightUtils';

/**
 * Parses Brazilian numbers (e.g., "1.250,50" or "12,99" or "2") to float
 */
export function parseBRLNumber(val: string | number | undefined | null): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const clean = val
    .toString()
    .trim()
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '') // remove thousands dot
    .replace(',', '.'); // replace decimal comma
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

/**
 * Format number to Brazilian currency string (R$ 0,00)
 */
export function formatBRL(val: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(val || 0);
}

/**
 * Helper function to format ISO or BR date strings (e.g. 2026-08-15T14:30:00 -> 15/08/2026 14:30:00)
 */
export function formatIsoOrBrDate(dateStr: string | null | undefined): string {
  if (!dateStr) return new Date().toLocaleString('pt-BR');
  const cleanStr = String(dateStr).trim();

  // Match ISO format 2026-08-15T14:30:00 or 2026-08-15
  const isoMatch = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoMatch) {
    const [, y, m, d, hh, mm, ss] = isoMatch;
    if (hh && mm) {
      return `${d}/${m}/${y} ${hh}:${mm}${ss ? `:${ss}` : ''}`;
    }
    return `${d}/${m}/${y}`;
  }

  // Match BR format 15/08/2026 14:30:00 or 15/08/2026
  const brMatch = cleanStr.match(/(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/);
  if (brMatch) {
    return brMatch[1];
  }

  return cleanStr;
}

/**
 * Validates if a string is a legitimate Store / Company Name (Razão Social / Nome Fantasia)
 */
export function isValidStoreName(rawLine: string): boolean {
  if (!rawLine) return false;
  const line = rawLine.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (line.length < 3 || line.length > 90) return false;

  // Must contain letters
  if (!/[A-Za-zÀ-ÿ]{3,}/.test(line)) return false;

  // Ban known system labels, titles, dates, numbers and address headers
  if (/DOCUMENTO\s+AUXILIAR/i.test(line)) return false;
  if (/NOTA\s+FISCAL/i.test(line)) return false;
  if (/CONSUMIDOR\s+ELETR[OÔ]NICA/i.test(line)) return false;
  if (/DANFE\s+NFC-?e/i.test(line)) return false;
  if (/^NFC-?e\b/i.test(line)) return false;
  if (/N[ãa]o\s+permite\s+aproveitamento/i.test(line)) return false;
  if (/Consulta\s+(?:via|pela|por|p[uú]blica)/i.test(line)) return false;
  if (/Protocolo\s+de\s+autoriza[çc][aã]o/i.test(line)) return false;
  if (/Via\s+(?:do\s+)?Consumidor/i.test(line)) return false;
  if (/CHAVE\s+DE\s+ACESSO/i.test(line)) return false;
  if (/VALOR\s+(?:A\s+PAGAR|TOTAL|RECEBIDO|PAGO)/i.test(line)) return false;
  if (/FORMA\s+DE\s+PAGAMENTO/i.test(line)) return false;
  if (/TRIBUTOS\s+TOTAIS/i.test(line)) return false;
  if (/EMISS[ÃA]O|Emiss[aã]o/i.test(line)) return false;
  if (/^S[eé]rie\b/i.test(line)) return false;
  if (/^CNPJ\s*:\s*\d{2}\.\d{3}\.\d{3}/i.test(line)) return false;
  if (/^IE\s*:\s*\d+/i.test(line)) return false;
  if (/^IM\s*:\s*\d+/i.test(line)) return false;
  if (/Endere[çc]o|^\s*Rua\b|^\s*Av\b|^\s*Avenida\b|^\s*Rodovia\b|^\s*Alameda\b|^\s*Travessa\b|^\s*Pra[çc]a\b|CEP\s*:\s*\d/i.test(line)) return false;
  if (/S[aã]o\s*Paulo\s*-\s*SP|Estado\s+de\s+S[aã]o\s+Paulo/i.test(line) && !/DISTRIBUIDORA|SUPERMERCADO|COMERCIO|LTDA|S\/A/i.test(line)) return false;
  if (/Secretaria\s+da\s+Fazenda|Portal\s+da\s+SEFAZ|Governo\s+do\s+Estado/i.test(line)) return false;
  if (/Qtde?|Vl\.\s*Unit|Vl\.\s*Total|Item\s*C[oó]digo|C[oó]digo\s+Descri[çc][aã]o/i.test(line)) return false;
  if (/^[\s\-_=*.:;]+$/.test(line)) return false;

  return true;
}

/**
 * Extracts Razão Social / Nome do Estabelecimento from raw string / HTML / XML / DOM
 */
export function extractStoreName(input: string, doc?: Document | null): string {
  if (!input) return 'SENDAS DISTRIBUIDORA S/A';

  // 1. XML check: <xNome> or <xFant>
  const xmlXNome = input.match(/<emit>[\s\S]*?<xNome>([\s\S]*?)<\/xNome>/i)?.[1] ||
                   input.match(/<xNome>([\s\S]*?)<\/xNome>/i)?.[1];
  if (xmlXNome && xmlXNome.trim()) {
    return xmlXNome.replace(/\s+/g, ' ').trim();
  }
  const xmlXFant = input.match(/<emit>[\s\S]*?<xFant>([\s\S]*?)<\/xFant>/i)?.[1] ||
                   input.match(/<xFant>([\s\S]*?)<\/xFant>/i)?.[1];
  if (xmlXFant && xmlXFant.trim()) {
    return xmlXFant.replace(/\s+/g, ' ').trim();
  }

  // 2. Direct match for SENDAS DISTRIBUIDORA or known companies in raw text
  const sendasMatch = input.match(/SENDAS\s+DISTRIBUIDORA(?:\s+S\/?A\.?)?/i);
  if (sendasMatch) {
    return 'SENDAS DISTRIBUIDORA S/A';
  }

  // 3. DOM Document check (if available)
  if (doc) {
    // Sefaz SP classes: .txtTopo is the primary class used by Sefaz SP for Razão Social
    const txtTopoList = doc.querySelectorAll('.txtTopo, #lblRazaoSocial, #lblNomeFantasia, #u20, .media-heading');
    for (const el of Array.from(txtTopoList)) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (isValidStoreName(text)) {
        return text;
      }
    }

    const cabecalhoList = doc.querySelectorAll('.NFCCabecalho');
    for (const el of Array.from(cabecalhoList)) {
      if (el.classList.contains('NFCCabecalho_cnpj')) continue;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (isValidStoreName(text)) {
        return text;
      }
    }
  }

  // 4. Search near "DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRÔNICA"
  const docAuxMatch = input.match(/DOCUMENTO\s+AUXILIAR\s+DA\s+NOTA\s+FISCAL\s+DE\s+CONSUMIDOR\s+ELETR[OÔ]NICA/i);
  if (docAuxMatch && docAuxMatch.index !== undefined) {
    // Check lines after
    const afterText = input.substring(docAuxMatch.index + docAuxMatch[0].length, docAuxMatch.index + docAuxMatch[0].length + 500);
    const linesAfter = afterText.split(/[\r\n<>]+/).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    for (const line of linesAfter) {
      if (isValidStoreName(line)) {
        return line;
      }
    }
    // Check lines before
    const beforeText = input.substring(Math.max(0, docAuxMatch.index - 500), docAuxMatch.index);
    const linesBefore = beforeText.split(/[\r\n<>]+/).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    for (const line of linesBefore.reverse()) {
      if (isValidStoreName(line)) {
        return line;
      }
    }
  }

  // 5. Line preceding or following CNPJ: XX.XXX.XXX/XXXX-XX
  const cnpjMatch = input.match(/(?:(?:CNPJ\s*:?\s*)?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}))/i);
  if (cnpjMatch && cnpjMatch.index !== undefined) {
    const beforeCnpj = input.substring(Math.max(0, cnpjMatch.index - 350), cnpjMatch.index);
    const linesBeforeCnpj = beforeCnpj.split(/[\r\n<>]+/).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    for (const line of linesBeforeCnpj.reverse()) {
      if (isValidStoreName(line)) {
        return line;
      }
    }
    const afterCnpj = input.substring(cnpjMatch.index + cnpjMatch[0].length, cnpjMatch.index + cnpjMatch[0].length + 350);
    const linesAfterCnpj = afterCnpj.split(/[\r\n<>]+/).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    for (const line of linesAfterCnpj) {
      if (isValidStoreName(line)) {
        return line;
      }
    }
  }

  // 6. Look for lines with strong company identifiers (S/A, LTDA, DISTRIBUIDORA, etc.)
  const lines = input.split(/[\r\n<>]+/).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  for (let i = 0; i < Math.min(lines.length, 35); i++) {
    const line = lines[i];
    if (isValidStoreName(line) && /S\/A|S\.A\.|S\.A\b|LTDA|DISTRIBUIDORA|SUPERMERCADO|ATACADISTA|ATACADO|COMERCIO|DROGARIA|FARMACIA|AUTO POSTO|VAREJISTA|MERCADO|HIPERMERCADO|PANIFICADORA|PADARIA|RESTAURANTE|LOJAS?|EXPRESS/i.test(line)) {
      return line;
    }
  }

  // 7. Fallback to first valid top line
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const line = lines[i];
    if (isValidStoreName(line)) {
      return line;
    }
  }

  return 'SENDAS DISTRIBUIDORA S/A';
}

/**
 * Extracts Date of Receipt
 */
export function extractReceiptDate(input: string, doc?: Document | null): string {
  if (!input) return new Date().toLocaleString('pt-BR');

  // 1. XML tags
  const xmlDate = input.match(/<ide>[\s\S]*?<dhEmi>([\s\S]*?)<\/dhEmi>/i)?.[1] ||
                  input.match(/<dhEmi>([\s\S]*?)<\/dhEmi>/i)?.[1] ||
                  input.match(/<ide>[\s\S]*?<dEmi>([\s\S]*?)<\/dEmi>/i)?.[1] ||
                  input.match(/<dEmi>([\s\S]*?)<\/dEmi>/i)?.[1] ||
                  input.match(/<dhRecbto>([\s\S]*?)<\/dhRecbto>/i)?.[1];
  if (xmlDate && xmlDate.trim()) {
    return formatIsoOrBrDate(xmlDate.trim());
  }

  // 2. DOM text
  const bodyText = doc?.body?.textContent || input;

  // 3. Match patterns like "Emissão: 15/08/2026 14:30:00" or "Data da Compra: 15/08/2026"
  const dateMatch = bodyText.match(/Emiss[aã]o:\s*(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i) ||
                    bodyText.match(/Data\s*(?:da\s*Compra|de\s*Emiss[aã]o|\/\s*Hora\s*Emiss[aã]o)?:\s*(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i) ||
                    bodyText.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/);
  if (dateMatch) {
    return formatIsoOrBrDate(dateMatch[1].trim());
  }

  const simpleDateMatch = bodyText.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (simpleDateMatch) {
    return simpleDateMatch[1].trim();
  }

  return new Date().toLocaleString('pt-BR');
}

/**
 * Parses standard XML from NFC-e (SEFAZ)
 */
export function parseNFCeXml(xmlString: string): Omit<NFCeReceipt, 'id' | 'scannedAt'> | null {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      // Not valid XML or contains HTML tags
      return null;
    }

    // Extract Emitente (Razão Social / Nome do Estabelecimento)
    const xNome = extractStoreName(xmlString, xmlDoc as unknown as Document);

    const emit = xmlDoc.querySelector('emit');
    const cnpj = emit?.querySelector('CNPJ')?.textContent?.trim() || 
                 xmlDoc.querySelector('CNPJ')?.textContent?.trim() || 
                 xmlString.match(/<CNPJ>([\s\S]*?)<\/CNPJ>/i)?.[1]?.trim() || '';

    // Extract Date / Time (Data da Compra / Emissão)
    const formattedDate = extractReceiptDate(xmlString, xmlDoc as unknown as Document);

    const ide = xmlDoc.querySelector('ide');
    const nNF = ide?.querySelector('nNF')?.textContent?.trim() || 
                xmlDoc.querySelector('nNF')?.textContent?.trim() || 
                xmlString.match(/<nNF>([\s\S]*?)<\/nNF>/i)?.[1]?.trim() || '';
    const serie = ide?.querySelector('serie')?.textContent?.trim() || 
                  xmlDoc.querySelector('serie')?.textContent?.trim() || '';

    // Extract Total
    const vNFStr = xmlDoc.querySelector('total ICMSTot vNF')?.textContent || 
                   xmlDoc.querySelector('vNF')?.textContent || 
                   xmlString.match(/<vNF>([\s\S]*?)<\/vNF>/i)?.[1] || '0';
    const valorTotal = parseBRLNumber(vNFStr);

    // Extract Items
    const detElements = xmlDoc.querySelectorAll('det');
    const itens: NFCeItem[] = [];
    const receiptId = generateUniqueId('rcpt');

    detElements.forEach((det, idx) => {
      const nItem = parseInt(det.getAttribute('nItem') || `${idx + 1}`, 10) || (idx + 1);
      const prod = det.querySelector('prod');
      if (!prod) return;

      const descricao = prod.querySelector('xProd')?.textContent?.trim() || `Item ${nItem}`;
      const qCom = parseBRLNumber(prod.querySelector('qCom')?.textContent || '1');
      const uCom = prod.querySelector('uCom')?.textContent?.trim() || 'UN';
      const vUnCom = parseBRLNumber(prod.querySelector('vUnCom')?.textContent || '0');
      const vProd = parseBRLNumber(prod.querySelector('vProd')?.textContent || `${vUnCom * qCom}`);

      const classification = classifyProduct(descricao);
      const pesoKg = extractPesoKg(descricao, qCom || 1, uCom, classification.tipo);
      const precoPorKg = calculatePrecoPorKg(vProd, pesoKg, qCom || 1, classification.tipo, uCom);

      itens.push({
        id: generateUniqueId('item'),
        receiptId,
        num: nItem,
        descricao,
        qtd: qCom || 1,
        unidade: uCom,
        pesoKg,
        precoPorKg,
        valorUnitario: vUnCom,
        valorTotal: vProd,
        razaoSocial: xNome,
        data: formattedDate,
        tipo: classification.tipo,
        produto: classification.produto,
        detalhe: classification.detalhe
      });
    });

    // Fallback if det querySelector was empty but regex can find <det> blocks
    if (itens.length === 0 && (xmlString.includes('<det') || xmlString.includes('<xProd>'))) {
      const detMatches = xmlString.match(/<det[\s\S]*?<\/det>/gi);
      if (detMatches) {
        detMatches.forEach((detBlock, idx) => {
          const xProd = detBlock.match(/<xProd>([\s\S]*?)<\/xProd>/i)?.[1]?.trim() || `Item ${idx + 1}`;
          const qCom = parseBRLNumber(detBlock.match(/<qCom>([\s\S]*?)<\/qCom>/i)?.[1] || '1');
          const vUnCom = parseBRLNumber(detBlock.match(/<vUnCom>([\s\S]*?)<\/vUnCom>/i)?.[1] || '0');
          const vProd = parseBRLNumber(detBlock.match(/<vProd>([\s\S]*?)<\/vProd>/i)?.[1] || `${qCom * vUnCom}`);
          const uCom = detBlock.match(/<uCom>([\s\S]*?)<\/uCom>/i)?.[1]?.trim() || 'UN';

          const classification = classifyProduct(xProd);
          const pesoKg = extractPesoKg(xProd, qCom || 1, uCom, classification.tipo);
          const precoPorKg = calculatePrecoPorKg(vProd, pesoKg, qCom || 1, classification.tipo, uCom);

          itens.push({
            id: generateUniqueId('item'),
            receiptId,
            num: idx + 1,
            descricao: xProd,
            qtd: qCom || 1,
            unidade: uCom,
            pesoKg,
            precoPorKg,
            valorUnitario: vUnCom,
            valorTotal: vProd,
            razaoSocial: xNome,
            data: formattedDate,
            tipo: classification.tipo,
            produto: classification.produto,
            detalhe: classification.detalhe
          });
        });
      }
    }

    if (itens.length === 0) {
      return null;
    }

    const calculatedTotal = itens.reduce((acc, it) => acc + it.valorTotal, 0);

    return {
      razaoSocial: xNome,
      cnpj,
      data: formattedDate,
      numeroNota: nNF,
      serie,
      valorTotal: valorTotal > 0 ? valorTotal : calculatedTotal,
      itens
    };
  } catch (err) {
    console.error('Error parsing NFCe XML:', err);
    return null;
  }
}

/**
 * Parses HTML from Sefaz SP Consulta Pública
 */
export function parseNFCeHtml(htmlString: string): Omit<NFCeReceipt, 'id' | 'scannedAt'> | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');

    // 1. Extract Razão Social (Store Name / Nome do Estabelecimento)
    const razaoSocial = extractStoreName(htmlString, doc);

    // 2. Extract CNPJ
    let cnpj = '';
    const cnpjMatch = doc.body?.textContent?.match(/CNPJ:\s*([\d./-]+)/i) || 
                      doc.body?.textContent?.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/) ||
                      htmlString.match(/CNPJ:\s*([\d./-]+)/i);
    if (cnpjMatch) {
      cnpj = cnpjMatch[1].trim();
    }

    // 3. Extract Data de Emissão / Data da Compra
    const formattedDate = extractReceiptDate(htmlString, doc);

    // 4. Extract Number of Invoice
    let numeroNota = '';
    const bodyText = doc.body?.textContent || htmlString;
    const nfeMatch = bodyText.match(/N[uú]mero:\s*(\d+)/i) || 
                     bodyText.match(/NFC-e\s*n[ºo]?\s*(\d+)/i);
    if (nfeMatch) {
      numeroNota = nfeMatch[1].trim();
    }

    // 5. Extract Total
    let valorTotal = 0;
    const totalMatch = bodyText.match(/Valor\s+a\s+pagar\s*R\$?\s*:?\s*([\d.,]+)/i) ||
                       bodyText.match(/Valor\s+Total\s*R\$?\s*:?\s*([\d.,]+)/i) ||
                       bodyText.match(/Total\s*R\$?\s*:?\s*([\d.,]+)/i);
    if (totalMatch) {
      valorTotal = parseBRLNumber(totalMatch[1]);
    }

    // 6. Extract Items
    const itens: NFCeItem[] = [];
    const receiptId = generateUniqueId('rcpt');

    // Look for Sefaz table rows or elements
    const tableRows = doc.querySelectorAll('#tabResult tr, table.table tr, .ui-datatable-data tr, tr');

    let currentItemNum = 1;

    tableRows.forEach((row) => {
      const titEl = row.querySelector('.txtTit, .RCod, .xProd, td:first-child');
      const qtyEl = row.querySelector('.Rqty, .RUnit, td:nth-child(2)');
      const valEl = row.querySelector('.Rval, .valor, td:last-child');

      const fullRowText = row.textContent?.trim() || '';
      
      // Check if this row looks like an item
      if (titEl || /Qtde\.|Vl\. Total|UN|KG/i.test(fullRowText)) {
        // Extract title
        let descricao = titEl?.textContent?.trim() || '';
        // Clean up title (remove code like "(Código: 1234)")
        descricao = descricao.replace(/\(C[oó]digo:[^)]+\)/gi, '').trim();

        // Extract qty, unit, unit val, total val from row text
        const qtyMatch = fullRowText.match(/Qtde?\.?:\s*([\d.,]+)/i) || fullRowText.match(/Qtd:\s*([\d.,]+)/i);
        const unMatch = fullRowText.match(/UN:\s*([A-Za-z]+)/i) || fullRowText.match(/(UN|KG|PC|CX|LT|G|DZ)\b/i);
        const unitValMatch = fullRowText.match(/Vl\.\s*Unit\.?:\s*([\d.,]+)/i) || fullRowText.match(/Unit:\s*([\d.,]+)/i);
        const totalValMatch = fullRowText.match(/Vl\.\s*Total:?\s*([\d.,]+)/i) || 
                              fullRowText.match(/Total:?\s*([\d.,]+)/i) ||
                              valEl?.textContent?.match(/([\d.,]+)/);

        const qtd = qtyMatch ? parseBRLNumber(qtyMatch[1]) : 1;
        const unidade = unMatch ? unMatch[1].toUpperCase() : 'UN';
        const valorUnitario = unitValMatch ? parseBRLNumber(unitValMatch[1]) : 0;
        let valorItem = totalValMatch ? parseBRLNumber(totalValMatch[1]) : 0;

        if (valorItem === 0 && valorUnitario > 0 && qtd > 0) {
          valorItem = valorUnitario * qtd;
        }

        if (descricao && descricao.length > 1 && !/Total|Subtotal|Desconto|Tributos|Forma de pagamento|Documento Auxiliar/i.test(descricao)) {
          const classification = classifyProduct(descricao);
          const pesoKg = extractPesoKg(descricao, qtd || 1, unidade, classification.tipo);
          const precoPorKg = calculatePrecoPorKg(valorItem, pesoKg, qtd || 1, classification.tipo, unidade);

          itens.push({
            id: generateUniqueId('item'),
            receiptId,
            num: currentItemNum,
            descricao,
            qtd: qtd || 1,
            unidade,
            pesoKg,
            precoPorKg,
            valorUnitario: valorUnitario || (valorItem / (qtd || 1)),
            valorTotal: valorItem,
            razaoSocial,
            data: formattedDate,
            tipo: classification.tipo,
            produto: classification.produto,
            detalhe: classification.detalhe
          });
          currentItemNum++;
        }
      }
    });

    // If tableRows didn't find items, try line-by-line parsing of text content
    if (itens.length === 0) {
      const rawText = doc.body?.innerText || doc.body?.textContent || htmlString;
      const lines = rawText.split('\n');
      return parseRawLines(lines, razaoSocial, formattedDate, cnpj, numeroNota);
    }

    if (itens.length === 0) {
      return null;
    }

    const calculatedTotal = itens.reduce((acc, it) => acc + it.valorTotal, 0);

    return {
      razaoSocial,
      cnpj,
      data: formattedDate,
      numeroNota,
      valorTotal: valorTotal > 0 ? valorTotal : calculatedTotal,
      itens
    };
  } catch (err) {
    console.error('Error parsing NFCe HTML:', err);
    return null;
  }
}

/**
 * Parses raw text lines (from copy paste or OCR)
 */
export function parseRawLines(
  lines: string[], 
  defaultRazao = '',
  defaultDate = '',
  defaultCnpj = '',
  defaultNumero = ''
): Omit<NFCeReceipt, 'id' | 'scannedAt'> | null {
  const fullRawText = lines.join('\n');
  const itens: NFCeItem[] = [];
  const receiptId = generateUniqueId('rcpt');
  
  let razaoSocial = defaultRazao || extractStoreName(fullRawText);
  let formattedDate = defaultDate || extractReceiptDate(fullRawText);
  let cnpj = defaultCnpj;
  let numeroNota = defaultNumero;
  let itemNum = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for CNPJ
    if (!cnpj && /CNPJ/i.test(line)) {
      const m = line.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
      if (m) cnpj = m[0];
    }

    // Check for Date if not resolved yet
    if (!defaultDate && /Emiss[aã]o|Data/i.test(line)) {
      const m = line.match(/\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?/);
      if (m) formattedDate = formatIsoOrBrDate(m[0]);
    }

    // Check for Invoice Number
    if (!numeroNota && /N[uú]mero\s*:?\s*(\d+)/i.test(line)) {
      const m = line.match(/N[uú]mero\s*:?\s*(\d+)/i);
      if (m) numeroNota = m[1];
    }

    // Check for items with format:
    // Description (Qty x UnitVal) TotalVal
    // or: 001 ARROZ 5KG 1 UN 25,90 25,90
    const itemPattern = /^(\d{1,3})?\s*(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:UN|KG|PC|LT|CX)?\s*(?:x|X)?\s*(?:R\$)?\s*(\d+[.,]\d{2})?\s*(?:R\$)?\s*(\d+[.,]\d{2})$/i;
    const match = line.match(itemPattern);

    if (match) {
      const desc = match[2].trim();
      const qtd = parseBRLNumber(match[3]);
      const unitVal = match[4] ? parseBRLNumber(match[4]) : 0;
      const totVal = parseBRLNumber(match[5]);

      if (desc && totVal > 0 && !/TOTAL|SUBTOTAL|DESCONTO|TROCO|PAGAMENTO|DOCUMENTO AUXILIAR/i.test(desc)) {
        const classification = classifyProduct(desc);
        const pesoKg = extractPesoKg(desc, qtd || 1, 'UN', classification.tipo);
        const precoPorKg = calculatePrecoPorKg(totVal, pesoKg, qtd || 1, classification.tipo, 'UN');

        itens.push({
          id: generateUniqueId('item'),
          receiptId,
          num: itemNum,
          descricao: desc,
          qtd: qtd || 1,
          unidade: 'UN',
          pesoKg,
          precoPorKg,
          valorUnitario: unitVal || (totVal / (qtd || 1)),
          valorTotal: totVal,
          razaoSocial,
          data: formattedDate,
          tipo: classification.tipo,
          produto: classification.produto,
          detalhe: classification.detalhe
        });
        itemNum++;
      }
    }
  }

  if (itens.length === 0) return null;

  return {
    razaoSocial,
    cnpj,
    data: formattedDate,
    numeroNota,
    valorTotal: itens.reduce((acc, it) => acc + it.valorTotal, 0),
    itens
  };
}

/**
 * Universal parser for any NFC-e input (XML, HTML, or raw text)
 */
export function parseUniversalNFCe(rawContent: string): Omit<NFCeReceipt, 'id' | 'scannedAt'> | null {
  const trimmed = rawContent.trim();
  if (!trimmed) return null;

  // 1. Try XML
  if (trimmed.startsWith('<') && (trimmed.includes('<nfeProc') || trimmed.includes('<NFe') || trimmed.includes('<infNFe') || trimmed.includes('<det'))) {
    const xmlResult = parseNFCeXml(trimmed);
    if (xmlResult && xmlResult.itens.length > 0) {
      return xmlResult;
    }
  }

  // 2. Try HTML
  if (trimmed.includes('<html') || trimmed.includes('<table') || trimmed.includes('<div') || trimmed.includes('tabResult') || trimmed.includes('NFCCabecalho')) {
    const htmlResult = parseNFCeHtml(trimmed);
    if (htmlResult && htmlResult.itens.length > 0) {
      return htmlResult;
    }
  }

  // 3. Try Raw lines / plain text
  return parseRawLines(trimmed.split('\n'));
}
