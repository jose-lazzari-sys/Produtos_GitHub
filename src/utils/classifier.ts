import { CategoryRule } from '../types';

export const CATEGORY_RULES: CategoryRule[] = [
  // 1. Alimentação
  { tipo: 'Alimentação', produto: 'açougue/peixaria', detalhe: 'carne, peixe, linguiça' },
  { tipo: 'Alimentação', produto: 'bebidas', detalhe: 'suco, vinho, refrigerante, cerveja, chá, leite' },
  { tipo: 'Alimentação', produto: 'hortifrúti', detalhe: 'fruta, verdura, legume, alho, batata' },
  { tipo: 'Alimentação', produto: 'laticínios e frios', detalhe: 'queijo, presunto, queijo ralado, requeijão, leite em pó, manteiga, margarina' },
  { tipo: 'Alimentação', produto: 'mercearia', detalhe: 'secos, molhados, entalado, tempero' },
  { tipo: 'Alimentação', produto: 'padaria', detalhe: 'pão, pão de queijo, rosca, bolacha, biscoito, salgadinho' },

  // 2. Higiene Pessoal
  { tipo: 'Higiene Pessoal', produto: 'bucal', detalhe: 'creme dental, escova de dente, enxaguante bucal e fio dental' },
  { tipo: 'Higiene Pessoal', produto: 'capilar', detalhe: 'shampoo, condicionador, creme para cabelo, pente, escova de cabelo' },
  { tipo: 'Higiene Pessoal', produto: 'corporal', detalhe: 'desodorante, cotonete, sabonete, hidratante, óleos' },
  { tipo: 'Higiene Pessoal', produto: 'íntima e papéis', detalhe: 'absorventes, hidratante, protetor solar, sabonete íntimo, papel higiênico, lenço de papel, lenço umedecido' },
  { tipo: 'Higiene Pessoal', produto: 'mãos/pés', detalhe: 'creme p/ mãos, creme p/ pés, sabonete líquido, álcool em gel' },
  { tipo: 'Higiene Pessoal', produto: 'pele/barbear', detalhe: 'protetores solares, limpadores faciais, barbeador' },

  // 3. Limpeza Doméstica
  { tipo: 'Limpeza Doméstica', produto: 'descartáveis', detalhe: 'papel filme, papel toalha, filtro café, papel alumínio, guardanapos, pratinhos, copo, luvas' },
  { tipo: 'Limpeza Doméstica', produto: 'acessórios', detalhe: 'esponja, pano de limpeza, saco de lixo, escova limpeza' },
  { tipo: 'Limpeza Doméstica', produto: 'desinfetantes', detalhe: 'água sanitária, desinfetante, alcool, removedor' },
  { tipo: 'Limpeza Doméstica', produto: 'detergentes', detalhe: 'lava louça, limpa alumínio, detergente, limpa móveis' },
  { tipo: 'Limpeza Doméstica', produto: 'inseticidas', detalhe: 'aerosol, iscas, raticidas, veneno insetos' },
  { tipo: 'Limpeza Doméstica', produto: 'lava roupas', detalhe: 'amaciantes, sabão em pó, sabão líquido, alvejantes' }
];

export const TIPO_OPTIONS = [
  'Todos',
  'Alimentação',
  'Higiene Pessoal',
  'Limpeza Doméstica',
  'Outros'
] as const;

export function getDetalheForTipoProduto(tipo?: string, produto?: string): string {
  if (!tipo || !produto || tipo === 'Outros' || produto === 'Outros') return 'Outros';
  const normTipo = normalizeTipo(tipo);
  const normProd = normalizeProduto(produto, normTipo);
  const rule = CATEGORY_RULES.find(r => r.tipo === normTipo && r.produto === normProd);
  return rule?.detalhe || 'Outros';
}

export const VALID_TIPOS: readonly ['Alimentação', 'Higiene Pessoal', 'Limpeza Doméstica'] = [
  'Alimentação',
  'Higiene Pessoal',
  'Limpeza Doméstica'
] as const;

/**
 * Validates and returns exactly the canonical TIPO:
 * 1. Checks if rawTipo matches one of the valid options ('Alimentação', 'Higiene Pessoal', 'Limpeza Doméstica')
 * 2. If YES => returns that valid TIPO.
 * 3. If NO => returns 'Outros'.
 */
export function normalizeTipo(rawTipo: string | undefined | null): 'Alimentação' | 'Higiene Pessoal' | 'Limpeza Doméstica' | 'Outros' {
  if (!rawTipo) return 'Outros';
  const clean = normalizeText(rawTipo);
  if (!clean || clean === 'outros' || clean === 'todos') return 'Outros';

  for (const t of VALID_TIPOS) {
    if (clean === normalizeText(t)) {
      return t;
    }
  }

  return 'Outros';
}

/**
 * Validates and returns exactly the PRODUTO according to the user's hierarchy:
 * 1. Is the validated tipo === 'Outros'?
 *    If YES => returns 'Outros'.
 * 2. If NO => Is rawProduto in the list of products belonging to that validated tipo?
 *    If YES => returns the exact canonical produto name from CATEGORY_RULES.
 *    If NO => returns 'Outros'.
 */
export function normalizeProduto(rawProd: string | undefined | null, tipo?: string): string {
  if (!rawProd || !tipo || tipo === 'Outros') return 'Outros';
  const cleanProd = normalizeText(rawProd);
  if (!cleanProd || cleanProd === 'outros') return 'Outros';

  // Normalize tipo first to be certain
  const validTipo = normalizeTipo(tipo);
  if (validTipo === 'Outros') return 'Outros';

  // Find products allowed strictly for this Tipo
  const allowedRules = CATEGORY_RULES.filter(r => r.tipo === validTipo);
  for (const rule of allowedRules) {
    if (cleanProd === normalizeText(rule.produto)) {
      return rule.produto;
    }
  }

  return 'Outros';
}

/**
 * Normalizes and resolves an item's tipo to one of the standard categories.
 */
export function getItemTipo(item: { tipo?: string } | string | undefined | null): 'Alimentação' | 'Higiene Pessoal' | 'Limpeza Doméstica' | 'Outros' {
  const raw = typeof item === 'string' ? item : item?.tipo;
  return normalizeTipo(raw);
}

/**
 * Normalizes string by removing accents, lowercase and trimming punctuation
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s/]/g, ' ') // replace special chars with space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips common noise tokens (quantities, units, weights, packing codes) to extract core product tokens
 */
export function extractCoreTokens(text: string): string[] {
  const norm = normalizeText(text);
  const words = norm.split(' ');
  const ignored = new Set([
    'kg', 'g', 'gr', 'gramas', 'kilo', 'kilos', 'quilo', 'quilos', 'mg',
    'l', 'lt', 'lts', 'litro', 'litros', 'ml', 'mls',
    'un', 'und', 'unid', 'unidade', 'unidades', 'pc', 'pct', 'pacote', 'pacotes',
    'cx', 'cxa', 'caixa', 'caixas', 'dz', 'duzia', 'duzias',
    'de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'em', 'para', 'por', 'ao', 'na', 'no',
    'c/', 's/', 'tipo', 'marca', 'ref', 'cod', 'item', 'fc', 'congelado', 'fresco',
    'sadia', 'perdigao', 'seara', 'friboi', 'aurora', 'qualita', 'taeq', 'dia'
  ]);

  return words.filter(w => {
    if (w.length < 2) return false;
    if (/^\d+$/.test(w)) return false; // purely numbers
    if (/^\d+[a-z]+$/.test(w)) return false; // e.g. 500g, 1kg, 2l
    return !ignored.has(w);
  });
}

/**
 * Calculates Dice / Bigram similarity coefficient between two strings (0.0 to 1.0)
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeText(str1).replace(/\s+/g, '');
  const s2 = normalizeText(str2).replace(/\s+/g, '');
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return s1 === s2 ? 1.0 : 0;

  const getBigrams = (s: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      bigrams.add(s.substring(i, i + 2));
    }
    return bigrams;
  };

  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);
  let intersection = 0;
  for (const item of b1) {
    if (b2.has(item)) intersection++;
  }

  return (2.0 * intersection) / (b1.size + b2.size);
}

const LEARNED_MEMORY_KEY = 'nfce_learned_classifications_v1';

export interface LearnedClassification {
  tipo: string;
  produto: string;
  detalhe: string;
  sourceDesc: string;
  count: number;
}

/**
 * In-memory cache of learned classifications from historical items and user edits
 */
let learnedCache: Map<string, LearnedClassification> | null = null;

export function getLearnedMemory(): Map<string, LearnedClassification> {
  if (learnedCache) return learnedCache;

  learnedCache = new Map<string, LearnedClassification>();
  try {
    const raw = localStorage.getItem(LEARNED_MEMORY_KEY);
    if (raw) {
      const parsed: Record<string, LearnedClassification> = JSON.parse(raw);
      Object.entries(parsed).forEach(([key, val]) => {
        if (val && val.tipo && val.tipo !== 'Outros') {
          learnedCache!.set(key, val);
        }
      });
    }
  } catch (e) {
    console.error('Error loading learned classifications:', e);
  }

  return learnedCache;
}

/**
 * Saves a newly learned or user-edited classification into the intelligent historical memory
 */
export function learnItemClassification(
  descricao: string,
  tipo: string,
  produto: string,
  detalhe?: string
): void {
  if (!descricao || !tipo || tipo === 'Outros') return;

  const memory = getLearnedMemory();
  const normalized = normalizeText(descricao);
  if (!normalized) return;

  const existing = memory.get(normalized);
  const count = (existing?.count || 0) + 1;

  memory.set(normalized, {
    tipo: normalizeTipo(tipo),
    produto: normalizeProduto(produto, tipo),
    detalhe: detalhe?.trim() || 'Outros',
    sourceDesc: descricao.trim(),
    count
  });

  // Persist to localStorage
  try {
    const obj: Record<string, LearnedClassification> = {};
    memory.forEach((val, key) => {
      obj[key] = val;
    });
    localStorage.setItem(LEARNED_MEMORY_KEY, JSON.stringify(obj));
  } catch (e) {
    console.error('Error saving learned classifications:', e);
  }
}

/**
 * Classifies an item based on:
 * 1. Exact historical database match (SEFAZ descriptions already learned)
 * 2. Token overlap and similarity with previously classified SEFAZ descriptions
 * 3. Fallback semantic heuristics
 */
export function classifyProduct(
  descricao: string,
  databaseItems?: Array<{ descricao?: string; tipo?: string; produto?: string; detalhe?: string }>
): {
  tipo: string;
  produto: string;
  detalhe: string;
} {
  if (!descricao || !descricao.trim()) {
    return {
      tipo: 'Outros',
      produto: 'Outros',
      detalhe: 'Não categorizado'
    };
  }

  const normalized = normalizeText(descricao);
  const coreTokens = extractCoreTokens(descricao);

  // 1. Check exact match in learned memory
  const memory = getLearnedMemory();
  if (memory.has(normalized)) {
    const learned = memory.get(normalized)!;
    return {
      tipo: learned.tipo,
      produto: learned.produto,
      detalhe: learned.detalhe
    };
  }

  // 2. Check if provided databaseItems has an exact or high-confidence match
  if (databaseItems && databaseItems.length > 0) {
    for (const item of databaseItems) {
      if (!item.descricao || !item.tipo || item.tipo === 'Outros') continue;
      const itemNorm = normalizeText(item.descricao);
      if (itemNorm === normalized) {
        // Learn it automatically
        learnItemClassification(descricao, item.tipo, item.produto || 'Outros', item.detalhe);
        return {
          tipo: normalizeTipo(item.tipo),
          produto: normalizeProduto(item.produto, item.tipo),
          detalhe: item.detalhe?.trim() || 'Outros'
        };
      }
    }
  }

  // 3. Search learned memory & database for the highest token overlap or string similarity
  let bestMatch: { tipo: string; produto: string; detalhe: string; score: number } | null = null;

  // Search in memory
  memory.forEach((val, key) => {
    if (val.tipo === 'Outros') return;

    // Token subset test: if all core tokens of this description exist in the learned one, or vice-versa
    const keyTokens = extractCoreTokens(key);
    const sharedTokens = coreTokens.filter(t => keyTokens.includes(t));
    
    let score = 0;
    if (coreTokens.length > 0 && sharedTokens.length === coreTokens.length) {
      score = 0.95; // Perfect token subset match
    } else if (coreTokens.length > 0 && sharedTokens.length > 0) {
      score = sharedTokens.length / Math.max(coreTokens.length, keyTokens.length);
    }

    // Also check string bigram similarity
    const sim = calculateSimilarity(normalized, key);
    if (sim > score) score = sim;

    if (score >= 0.65 && (!bestMatch || score > bestMatch.score)) {
      bestMatch = {
        tipo: val.tipo,
        produto: val.produto,
        detalhe: val.detalhe,
        score
      };
    }
  });

  if (bestMatch && bestMatch.score >= 0.65) {
    return {
      tipo: bestMatch.tipo,
      produto: bestMatch.produto,
      detalhe: bestMatch.detalhe
    };
  }

  // Fallback to "Outros" if not found in historical memory or database
  return {
    tipo: 'Outros',
    produto: 'Outros',
    detalhe: 'Outros'
  };
}
