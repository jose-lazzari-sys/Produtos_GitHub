import { NFCeItem } from '../types';

/**
 * Extracts the weight in Kilograms (PESO Kg) for a product.
 * 
 * Rules:
 * - Only applies if tipo === 'Alimentação'. For other types, returns 0.
 * - Condition a: If "KG" is present in unit / qtd (e.g. unidade === 'KG' or contains 'KG'):
 *     => Adopt the numeric qtd value in PESO Kg. (e.g. Qtd: 0.768 KG => 0.768)
 * - Condition b: Else check in descricao if there is the word/unit "Kg" or "g":
 *     => Adopt the value preceding "Kg" or "g" (converted to Kg, e.g. 395g => 0.395, 1kg => 1.0)
 * - Condition c: If neither matches, return 0.
 */
export function extractPesoKg(
  descricao: string,
  qtd: number,
  unidade?: string,
  tipo = 'Alimentação'
): number {
  if (tipo !== 'Alimentação') {
    return 0;
  }

  const cleanUnit = (unidade || '').trim().toUpperCase();
  const cleanDesc = (descricao || '').trim();

  // Condition a: Check if unit or QTD indicates KG (e.g. UN: KG, or contains KG)
  if (cleanUnit === 'KG' || cleanUnit === 'KILO' || cleanUnit === 'QUILO' || cleanUnit.includes('KG')) {
    const parsedQtd = Number(qtd);
    if (!isNaN(parsedQtd) && parsedQtd > 0) {
      return Number(parsedQtd.toFixed(3));
    }
  }

  // Condition b: Search description for weight specifications (e.g. 395g, 500g, 1kg, 1,5kg, 2.5 kg)
  if (cleanDesc) {
    // 1. Look for explicit KG patterns: e.g. "5KG", "1.5 KG", "2,5KG", "1 KILO"
    const kgRegex = /(?:^|\s|[^\d.,])(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilo|kilos|quilo|quilos)(?:\b|[^\w]|$)/i;
    const kgMatch = cleanDesc.match(kgRegex);
    if (kgMatch && kgMatch[1]) {
      const val = parseFloat(kgMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        return Number(val.toFixed(3));
      }
    }

    // 2. Look for Grams patterns: e.g. "395g", "500G", "200 g", "90gr", "350 gramas"
    const gRegex = /(?:^|\s|[^\d.,])(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|gramas)(?:\b|[^\w]|$)/i;
    const gMatch = cleanDesc.match(gRegex);
    if (gMatch && gMatch[1]) {
      const val = parseFloat(gMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        // Convert grams to kg (e.g. 395g -> 0.395 kg)
        const inKg = val / 1000;
        return Number(inKg.toFixed(3));
      }
    }
  }

  // Condition c: Fallback to 0
  return 0;
}

/**
 * Calculates the price per Kilogram (R$/Kg).
 * 
 * Formula specified: "4.VALOR (R$)" dividido por "PESO Kg" dividido por "3.QTD."
 * => valorTotal / pesoKg / qtd = valorTotal / (pesoKg * qtd)
 * 
 * Note: If unit is already 'KG' and pesoKg equals qtd, valorTotal / pesoKg gives the price per kg.
 */
export function calculatePrecoPorKg(
  valorTotal: number,
  pesoKg: number,
  qtd: number,
  tipo = 'Alimentação',
  unidade?: string
): number {
  if (tipo !== 'Alimentação' || !pesoKg || pesoKg <= 0) {
    return 0;
  }

  const cleanUnit = (unidade || '').trim().toUpperCase();
  const safeQtd = Number(qtd) > 0 ? Number(qtd) : 1;
  const safeVal = Number(valorTotal) || 0;

  // If unit is KG and pesoKg is the total weighed quantity, R$/Kg is valorTotal / pesoKg
  if (cleanUnit === 'KG' || Math.abs(pesoKg - safeQtd) < 0.0001) {
    return safeVal / pesoKg;
  }

  // Otherwise, for discrete units (e.g. 2 units of 395g each), total weight is pesoKg * qtd
  return safeVal / (pesoKg * safeQtd);
}

/**
 * Extracts volume in Liters for beverage items (bebidas).
 */
export function extractVolumeLitros(
  descricao: string,
  qtd: number,
  unidade?: string,
  produto = ''
): number {
  const cleanUnit = (unidade || '').trim().toUpperCase();
  const cleanDesc = (descricao || '').trim();

  // If unit is L or LT or LTS or LITRO
  if (cleanUnit === 'L' || cleanUnit === 'LT' || cleanUnit === 'LTS' || cleanUnit === 'LITRO' || cleanUnit === 'LITROS') {
    const parsedQtd = Number(qtd);
    if (!isNaN(parsedQtd) && parsedQtd > 0) {
      return Number(parsedQtd.toFixed(3));
    }
  }

  if (cleanDesc) {
    // 1. Look for explicit Liters: e.g. "1.5L", "2L", "1L", "2 LITROS", "1,5 LT"
    const lRegex = /(?:^|\s|[^\d.,])(\d+(?:[.,]\d+)?)\s*(?:l|lt|lts|litro|litros)(?:\b|[^\w]|$)/i;
    const lMatch = cleanDesc.match(lRegex);
    if (lMatch && lMatch[1]) {
      const val = parseFloat(lMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        return Number(val.toFixed(3));
      }
    }

    // 2. Look for Milliliters: e.g. "350ml", "500 ML", "250ml", "900ml"
    const mlRegex = /(?:^|\s|[^\d.,])(\d+(?:[.,]\d+)?)\s*(?:ml|mls)(?:\b|[^\w]|$)/i;
    const mlMatch = cleanDesc.match(mlRegex);
    if (mlMatch && mlMatch[1]) {
      const val = parseFloat(mlMatch[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) {
        return Number((val / 1000).toFixed(3));
      }
    }
  }

  return 0;
}

/**
 * Calculates the price per Liter (R$/litro) for beverages.
 */
export function calculatePrecoPorLitro(
  valorTotal: number,
  volumeL: number,
  qtd: number,
  unidade?: string
): number {
  if (!volumeL || volumeL <= 0) return 0;
  const cleanUnit = (unidade || '').trim().toUpperCase();
  const safeQtd = Number(qtd) > 0 ? Number(qtd) : 1;
  const safeVal = Number(valorTotal) || 0;

  if (cleanUnit === 'L' || cleanUnit === 'LT' || Math.abs(volumeL - safeQtd) < 0.0001) {
    return safeVal / volumeL;
  }

  return safeVal / (volumeL * safeQtd);
}

/**
 * Calculates the total weight in Kilograms (or volume in Liters for beverages, where 1L = 1Kg)
 * for an item belonging to 'Alimentação'.
 * 
 * Hierarchy:
 * 1. PRIMARY SOURCE OF TRUTH: Explicit pesoKg set on the item (from "Editar Classificação e Item",
 *    imported spreadsheet column "PESO Kg", or stored item record).
 * 2. Fallback: Unit 'KG' where qtd is the total weight.
 * 3. Fallback: Beverage or liquid volume (where 1L = 1Kg).
 * 4. Fallback: Extracted weight from description (e.g. "395g").
 */
export function getItemAlimentacaoWeight(item: {
  tipo?: string;
  produto?: string;
  descricao?: string;
  qtd?: number;
  unidade?: string;
  pesoKg?: number;
}): number {
  if (!item) {
    return 0;
  }

  // Verify that item belongs to 'Alimentação'
  const rawTipo = (item.tipo || '').trim();
  if (rawTipo) {
    const norm = rawTipo.toLowerCase();
    const isAlimentacao = norm.includes('alimen') || norm.includes('comida') || norm === 'alimentação';
    if (!isAlimentacao) {
      return 0;
    }
  }

  // 1. PRIMARY SOURCE OF TRUTH: Explicit pesoKg set on the item
  // Matches exact value found in "Editar Classificação e Item"
  const parsedPeso = typeof item.pesoKg === 'number'
    ? item.pesoKg
    : (item.pesoKg !== undefined && item.pesoKg !== null && String(item.pesoKg).trim() !== ''
        ? parseFloat(String(item.pesoKg).replace(',', '.'))
        : 0);

  if (!isNaN(parsedPeso) && parsedPeso > 0) {
    return Number(parsedPeso.toFixed(3));
  }

  const cleanUnit = (item.unidade || '').trim().toUpperCase();
  const safeQtd = Number(item.qtd) > 0 ? Number(item.qtd) : 1;
  const normProd = (item.produto || '').trim().toLowerCase();

  // 2. Fallback: If unit is explicitly KG, quantity itself is the total weight in Kg
  if (cleanUnit === 'KG' || cleanUnit === 'KILO' || cleanUnit === 'QUILO' || cleanUnit.includes('KG')) {
    return safeQtd;
  }

  // 3. Fallback: Beverage products (bebidas) or liquid units (L, LT, ML)
  if (normProd === 'bebidas' || cleanUnit === 'L' || cleanUnit === 'LT' || cleanUnit === 'LTS' || cleanUnit === 'ML') {
    const vol = extractVolumeLitros(item.descricao || '', safeQtd, item.unidade, item.produto);
    if (vol > 0) {
      if (cleanUnit === 'L' || cleanUnit === 'LT' || Math.abs(vol - safeQtd) < 0.0001) {
        return Number(vol.toFixed(3));
      }
      return Number((vol * safeQtd).toFixed(3));
    }
  }

  // 4. Fallback: Pre-packaged items with weight in description (e.g. 395g * safeQtd)
  const extractedWeight = extractPesoKg(item.descricao || '', safeQtd, item.unidade, item.tipo);
  if (extractedWeight > 0) {
    if (Math.abs(extractedWeight - safeQtd) < 0.0001) {
      return extractedWeight;
    }
    return Number((extractedWeight * safeQtd).toFixed(3));
  }

  // 5. Fallback: Volume check for liquid food (e.g. azeite, óleo, vinagre, leite)
  const vol = extractVolumeLitros(item.descricao || '', safeQtd, item.unidade, item.produto);
  if (vol > 0) {
    if (cleanUnit === 'L' || cleanUnit === 'LT' || Math.abs(vol - safeQtd) < 0.0001) {
      return Number(vol.toFixed(3));
    }
    return Number((vol * safeQtd).toFixed(3));
  }

  return 0;
}
