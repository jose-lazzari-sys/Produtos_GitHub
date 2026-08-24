import express from 'express';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Helper function to parse BRL numbers
function parseNumberBRL(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const clean = String(val).trim().replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

// Helper function to format ISO or BR date strings
function formatIsoOrBrDate(dateStr: string): string {
  if (!dateStr) return new Date().toLocaleString('pt-BR');
  const cleanStr = String(dateStr).trim();

  // Match ISO 2026-08-15T14:30:00 or 2026-08-15
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

// Helper function to validate store name
function isValidStoreName(rawLine: string): boolean {
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

// Helper function to extract store name
function extractServerStoreName(htmlOrXml: string, $: cheerio.CheerioAPI): string {
  if (!htmlOrXml) return 'SENDAS DISTRIBUIDORA S/A';

  // 1. XML check: <xNome> or <xFant>
  const xmlXNome = htmlOrXml.match(/<emit>[\s\S]*?<xNome>([\s\S]*?)<\/xNome>/i)?.[1] ||
                   htmlOrXml.match(/<xNome>([\s\S]*?)<\/xNome>/i)?.[1];
  if (xmlXNome && xmlXNome.trim()) {
    return xmlXNome.replace(/\s+/g, ' ').trim();
  }
  const xmlXFant = htmlOrXml.match(/<emit>[\s\S]*?<xFant>([\s\S]*?)<\/xFant>/i)?.[1] ||
                   htmlOrXml.match(/<xFant>([\s\S]*?)<\/xFant>/i)?.[1];
  if (xmlXFant && xmlXFant.trim()) {
    return xmlXFant.replace(/\s+/g, ' ').trim();
  }

  // 2. Direct match for SENDAS DISTRIBUIDORA or known companies in raw text
  const sendasMatch = htmlOrXml.match(/SENDAS\s+DISTRIBUIDORA(?:\s+S\/?A\.?)?/i);
  if (sendasMatch) {
    return 'SENDAS DISTRIBUIDORA S/A';
  }

  // 3. Cheerio selectors (Sefaz SP classes)
  const txtTopoList = $('.txtTopo, #lblRazaoSocial, #lblNomeFantasia, #u20, .media-heading');
  for (let i = 0; i < txtTopoList.length; i++) {
    const text = $(txtTopoList[i]).text().replace(/\s+/g, ' ').trim();
    if (isValidStoreName(text)) {
      return text;
    }
  }

  const cabecalhoList = $('.NFCCabecalho');
  for (let i = 0; i < cabecalhoList.length; i++) {
    const el = $(cabecalhoList[i]);
    if (el.hasClass('NFCCabecalho_cnpj')) continue;
    const text = el.text().replace(/\s+/g, ' ').trim();
    if (isValidStoreName(text)) {
      return text;
    }
  }

  // 4. Search near "DOCUMENTO AUXILIAR DA NOTA FISCAL DE CONSUMIDOR ELETRÔNICA"
  const docAuxMatch = htmlOrXml.match(/DOCUMENTO\s+AUXILIAR\s+DA\s+NOTA\s+FISCAL\s+DE\s+CONSUMIDOR\s+ELETR[OÔ]NICA/i);
  if (docAuxMatch && docAuxMatch.index !== undefined) {
    const afterText = htmlOrXml.substring(docAuxMatch.index + docAuxMatch[0].length, docAuxMatch.index + docAuxMatch[0].length + 500);
    const linesAfter = afterText.split(/[\r\n<>]+/).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    for (const line of linesAfter) {
      if (isValidStoreName(line)) {
        return line;
      }
    }
    const beforeText = htmlOrXml.substring(Math.max(0, docAuxMatch.index - 500), docAuxMatch.index);
    const linesBefore = beforeText.split(/[\r\n<>]+/).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    for (const line of linesBefore.reverse()) {
      if (isValidStoreName(line)) {
        return line;
      }
    }
  }

  // 5. Line preceding or following CNPJ: XX.XXX.XXX/XXXX-XX
  const cnpjMatch = htmlOrXml.match(/(?:(?:CNPJ\s*:?\s*)?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}))/i);
  if (cnpjMatch && cnpjMatch.index !== undefined) {
    const beforeCnpj = htmlOrXml.substring(Math.max(0, cnpjMatch.index - 350), cnpjMatch.index);
    const linesBeforeCnpj = beforeCnpj.split(/[\r\n<>]+/).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    for (const line of linesBeforeCnpj.reverse()) {
      if (isValidStoreName(line)) {
        return line;
      }
    }
    const afterCnpj = htmlOrXml.substring(cnpjMatch.index + cnpjMatch[0].length, cnpjMatch.index + cnpjMatch[0].length + 350);
    const linesAfterCnpj = afterCnpj.split(/[\r\n<>]+/).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    for (const line of linesAfterCnpj) {
      if (isValidStoreName(line)) {
        return line;
      }
    }
  }

  // 6. Look for lines with strong company identifiers (S/A, LTDA, DISTRIBUIDORA, etc.)
  const lines = htmlOrXml.split(/[\r\n<>]+/).map(l => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
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

// Server-side endpoint to fetch and parse Sefaz SP NFC-e
app.post('/api/parse-nfce', async (req, res) => {
  try {
    const { url, rawContent } = req.body;

    let htmlOrXml = rawContent;

    if (url && !htmlOrXml) {
      // Validate url
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return res.status(400).json({
          success: false,
          errorMessage: 'URL inválida. O formato deve começar com http:// ou https://'
        });
      }

      try {
        const response = await axios.get(url, {
          timeout: 12000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control': 'no-cache'
          },
          maxRedirects: 5,
          validateStatus: (status) => status >= 200 && status < 400
        });

        htmlOrXml = response.data;
      } catch (fetchErr: any) {
        console.error('Error fetching Sefaz URL:', fetchErr.message);
        return res.json({
          success: false,
          captchaDetected: true,
          needsManualInput: true,
          url,
          errorMessage: 'Não foi possível acessar diretamente a Sefaz SP (bloqueio ou captcha). Abra manualmente e cole o XML aqui.'
        });
      }
    }

    if (!htmlOrXml || typeof htmlOrXml !== 'string') {
      return res.status(400).json({
        success: false,
        errorMessage: 'Nenhum conteúdo HTML/XML ou URL foi fornecido.'
      });
    }

    // Check if Captcha / Challenge is present in page
    const isCaptcha = /captcha|recaptcha|hcaptcha|cf-challenge|desafio|digite o c[oó]digo|consultar chave/i.test(htmlOrXml) &&
                      !/NFCCabecalho|tabResult|xProd|vUnCom|txtTopo/i.test(htmlOrXml);

    if (isCaptcha) {
      return res.json({
        success: false,
        captchaDetected: true,
        needsManualInput: true,
        url: url || '',
        errorMessage: 'A página da Sefaz SP exige validação de Captcha. Abra manualmente e cole o XML/HTML aqui.'
      });
    }

    // Parse with Cheerio / Regex
    const $ = cheerio.load(htmlOrXml);

    // 1. Razão Social / Nome do Estabelecimento
    const razaoSocial = extractServerStoreName(htmlOrXml, $);

    // 2. CNPJ
    let cnpj = '';
    const cnpjXml = htmlOrXml.match(/<emit>[\s\S]*?<CNPJ>([\s\S]*?)<\/CNPJ>/i)?.[1] ||
                    htmlOrXml.match(/<CNPJ>([\s\S]*?)<\/CNPJ>/i)?.[1];
    if (cnpjXml) {
      cnpj = cnpjXml.trim();
    } else {
      const bodyText = $('body').text() || htmlOrXml;
      const cnpjMatch = bodyText.match(/CNPJ:\s*([\d./-]+)/i) || bodyText.match(/\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/);
      if (cnpjMatch) cnpj = cnpjMatch[1].trim();
    }

    // 3. Data de Emissão / Data da Compra
    let formattedDate = '';
    
    // Check XML dates first
    const dhEmiXml = htmlOrXml.match(/<ide>[\s\S]*?<dhEmi>([\s\S]*?)<\/dhEmi>/i)?.[1] ||
                     htmlOrXml.match(/<dhEmi>([\s\S]*?)<\/dhEmi>/i)?.[1] ||
                     htmlOrXml.match(/<ide>[\s\S]*?<dEmi>([\s\S]*?)<\/dEmi>/i)?.[1] ||
                     htmlOrXml.match(/<dEmi>([\s\S]*?)<\/dEmi>/i)?.[1] ||
                     htmlOrXml.match(/<dhRecbto>([\s\S]*?)<\/dhRecbto>/i)?.[1];
    if (dhEmiXml) {
      formattedDate = formatIsoOrBrDate(dhEmiXml);
    }

    // Check Sefaz HTML & text regex
    if (!formattedDate) {
      const bodyText = $('body').text() || htmlOrXml;
      const dateMatch = bodyText.match(/Emiss[aã]o:\s*(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i) ||
                        bodyText.match(/Data\s*(?:da\s*Compra|de\s*Emiss[aã]o|\/\s*Hora\s*Emiss[aã]o)?:\s*(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/i) ||
                        bodyText.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/);
      if (dateMatch) {
        formattedDate = formatIsoOrBrDate(dateMatch[1].trim());
      } else {
        const simpleDateMatch = bodyText.match(/(\d{2}\/\d{2}\/\d{4})/);
        if (simpleDateMatch) {
          formattedDate = simpleDateMatch[1].trim();
        } else {
          formattedDate = new Date().toLocaleString('pt-BR');
        }
      }
    }

    // 4. Numero Nota
    let numeroNota = '';
    const nNFXML = htmlOrXml.match(/<ide>[\s\S]*?<nNF>([\s\S]*?)<\/nNF>/i)?.[1] ||
                   htmlOrXml.match(/<nNF>([\s\S]*?)<\/nNF>/i)?.[1];
    if (nNFXML) {
      numeroNota = nNFXML.trim();
    } else {
      const bodyText = $('body').text() || htmlOrXml;
      const nfeMatch = bodyText.match(/N[uú]mero:\s*(\d+)/i) || bodyText.match(/NFC-e\s*n[ºo]?\s*(\d+)/i);
      if (nfeMatch) numeroNota = nfeMatch[1].trim();
    }

    // 5. Total
    let valorTotal = 0;
    const vNFXml = htmlOrXml.match(/<vNF>([\s\S]*?)<\/vNF>/i)?.[1];
    if (vNFXml) {
      valorTotal = parseNumberBRL(vNFXml);
    } else {
      const bodyText = $('body').text() || htmlOrXml;
      const totalMatch = bodyText.match(/Valor\s+a\s+pagar\s*R\$?\s*:?\s*([\d.,]+)/i) ||
                         bodyText.match(/Valor\s+Total\s*R\$?\s*:?\s*([\d.,]+)/i) ||
                         bodyText.match(/Total\s*R\$?\s*:?\s*([\d.,]+)/i);
      if (totalMatch) {
        valorTotal = parseNumberBRL(totalMatch[1]);
      }
    }

    // 6. Itens
    const rawItens: any[] = [];
    let itemIdx = 1;

    // Check table rows
    $('#tabResult tr, table.table tr, .ui-datatable-data tr, tr').each((_, row) => {
      const rowText = $(row).text().trim();
      const titEl = $(row).find('.txtTit, .RCod, .xProd, td:first-child').first();
      const valEl = $(row).find('.Rval, .valor, td:last-child').first();

      if (titEl.length > 0 || /Qtde\.|Vl\. Total|UN|KG/i.test(rowText)) {
        let descricao = titEl.text().trim() || '';
        descricao = descricao.replace(/\(C[oó]digo:[^)]+\)/gi, '').trim();

        const qtyMatch = rowText.match(/Qtde?\.?:\s*([\d.,]+)/i) || rowText.match(/Qtd:\s*([\d.,]+)/i);
        const unMatch = rowText.match(/UN:\s*([A-Za-z]+)/i) || rowText.match(/(UN|KG|PC|CX|LT|G|DZ)\b/i);
        const unitValMatch = rowText.match(/Vl\.\s*Unit\.?:\s*([\d.,]+)/i) || rowText.match(/Unit:\s*([\d.,]+)/i);
        const totalValMatch = rowText.match(/Vl\.\s*Total:?\s*([\d.,]+)/i) || 
                              rowText.match(/Total:?\s*([\d.,]+)/i) ||
                              valEl.text().match(/([\d.,]+)/);

        const qtd = qtyMatch ? parseNumberBRL(qtyMatch[1]) : 1;
        const unidade = unMatch ? unMatch[1].toUpperCase() : 'UN';
        const valorUnitario = unitValMatch ? parseNumberBRL(unitValMatch[1]) : 0;
        let valorItem = totalValMatch ? parseNumberBRL(totalValMatch[1]) : 0;

        if (valorItem === 0 && valorUnitario > 0 && qtd > 0) {
          valorItem = valorUnitario * qtd;
        }

        if (descricao && descricao.length > 1 && !/Total|Subtotal|Desconto|Tributos|Forma de pagamento/i.test(descricao)) {
          rawItens.push({
            num: itemIdx++,
            descricao,
            qtd: qtd || 1,
            unidade,
            valorUnitario: valorUnitario || (valorItem / (qtd || 1)),
            valorTotal: valorItem,
            razaoSocial,
            data: formattedDate
          });
        }
      }
    });

    // If no items extracted via Cheerio tables, check if it's XML format
    if (rawItens.length === 0 && (htmlOrXml.includes('<det') || htmlOrXml.includes('<xProd>'))) {
      const detMatches = htmlOrXml.match(/<det[\s\S]*?<\/det>/gi);
      if (detMatches) {
        detMatches.forEach((detBlock, idx) => {
          const xProd = detBlock.match(/<xProd>([\s\S]*?)<\/xProd>/i)?.[1]?.trim() || `Item ${idx + 1}`;
          const qCom = parseNumberBRL(detBlock.match(/<qCom>([\s\S]*?)<\/qCom>/i)?.[1] || '1');
          const vUnCom = parseNumberBRL(detBlock.match(/<vUnCom>([\s\S]*?)<\/vUnCom>/i)?.[1] || '0');
          const vProd = parseNumberBRL(detBlock.match(/<vProd>([\s\S]*?)<\/vProd>/i)?.[1] || `${qCom * vUnCom}`);
          const uCom = detBlock.match(/<uCom>([\s\S]*?)<\/uCom>/i)?.[1]?.trim() || 'UN';

          rawItens.push({
            num: idx + 1,
            descricao: xProd,
            qtd: qCom || 1,
            unidade: uCom,
            valorUnitario: vUnCom,
            valorTotal: vProd,
            razaoSocial,
            data: formattedDate
          });
        });
      }
    }

    if (rawItens.length === 0) {
      return res.json({
        success: false,
        needsManualInput: true,
        captchaDetected: true,
        url: url || '',
        errorMessage: 'Não foi possível extrair os itens automaticamente da página Sefaz. Abra manualmente e cole o XML aqui.'
      });
    }

    return res.json({
      success: true,
      receipt: {
        razaoSocial,
        cnpj,
        data: formattedDate,
        numeroNota,
        valorTotal: valorTotal || rawItens.reduce((acc, it) => acc + it.valorTotal, 0),
        itens: rawItens
      }
    });
  } catch (err: any) {
    console.error('API Parse NFC-e Exception:', err);
    return res.status(500).json({
      success: false,
      needsManualInput: true,
      errorMessage: 'Erro interno ao processar nota fiscal: ' + (err.message || 'Erro desconhecido')
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NFC-e PWA Server running on port ${PORT}`);
  });
}

startServer();
