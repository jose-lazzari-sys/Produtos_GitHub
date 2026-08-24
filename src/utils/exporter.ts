import { NFCeItem } from '../types';

export const GOOGLE_SHEETS_HEADERS = [
  'Num',
  'Descrição',
  'Qtd.',
  'Valor(R$)',
  'Nome / Razão Social',
  'data',
  'Tipo',
  'Produto',
  'Detalhe'
];

/**
 * Formats an array of NFCeItem into TSV string ready to paste into Google Sheets (Ctrl+V / Command+V)
 */
export function generateGoogleSheetsTSV(items: NFCeItem[]): string {
  const headerRow = GOOGLE_SHEETS_HEADERS.join('\t');
  const rows = items.map((item) => {
    const num = item.num ?? '';
    const desc = (item.descricao || '').replace(/[\t\n\r]/g, ' ');
    const qtd = typeof item.qtd === 'number' ? item.qtd.toString().replace('.', ',') : (item.qtd || '1');
    const valor = typeof item.valorTotal === 'number' ? item.valorTotal.toFixed(2).replace('.', ',') : (item.valorTotal || '0,00');
    let razao = (item.razaoSocial || '').replace(/[\t\n\r]/g, ' ').trim();
    if (!razao || razao === 'Estabelecimento Comercial' || razao === 'Estabelecimento Sefaz SP') {
      razao = 'SENDAS DISTRIBUIDORA S/A';
    }
    const data = item.data || '';
    const tipo = item.tipo || 'Outros';
    const produto = item.produto || 'Outros';
    const detalhe = item.detalhe || 'Outros';

    return [num, desc, qtd, valor, razao, data, tipo, produto, detalhe].join('\t');
  });

  return [headerRow, ...rows].join('\n');
}

/**
 * Formats items into CSV string for download (UTF-8 with BOM)
 */
export function generateGoogleSheetsCSV(items: NFCeItem[], delimiter: ';' | ',' = ';'): string {
  const escapeField = (val: any) => {
    const str = String(val ?? '').replace(/"/g, '""');
    if (str.includes(delimiter) || str.includes('\n') || str.includes('"')) {
      return `"${str}"`;
    }
    return str;
  };

  const headerRow = GOOGLE_SHEETS_HEADERS.map(escapeField).join(delimiter);
  const rows = items.map((item) => {
    const num = item.num ?? '';
    const desc = item.descricao || '';
    const qtd = typeof item.qtd === 'number' ? item.qtd.toString().replace('.', delimiter === ';' ? ',' : '.') : (item.qtd || '1');
    const valor = typeof item.valorTotal === 'number' ? item.valorTotal.toFixed(2).replace('.', delimiter === ';' ? ',' : '.') : (item.valorTotal || '0.00');
    let razao = item.razaoSocial || '';
    if (!razao || razao === 'Estabelecimento Comercial' || razao === 'Estabelecimento Sefaz SP') {
      razao = 'SENDAS DISTRIBUIDORA S/A';
    }
    const data = item.data || '';
    const tipo = item.tipo || 'Outros';
    const produto = item.produto || 'Outros';
    const detalhe = item.detalhe || 'Outros';

    return [num, desc, qtd, valor, razao, data, tipo, produto, detalhe].map(escapeField).join(delimiter);
  });

  // UTF-8 BOM prefix \uFEFF for proper accent handling in Excel and Google Sheets
  return '\uFEFF' + [headerRow, ...rows].join('\r\n');
}

/**
 * Downloads a file to the user's device
 */
export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Copies text to user clipboard with fallback
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    }
  } catch (err) {
    console.error('Failed to copy to clipboard', err);
    return false;
  }
}
