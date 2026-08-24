import { CategoryRule } from '../types';

export const CATEGORY_RULES: CategoryRule[] = [
  // 1. Alimentação - açougue/Peixaria
  {
    tipo: 'Alimentação',
    produto: 'açougue/peixaria',
    detalhe: 'carne, peixe, linguiça',
    keywords: [
      'carne', 'peixe', 'linguiça', 'linguica', 'bovino', 'suino', 'suíno', 'frango', 'ave',
      'alcatra', 'picanha', 'contra file', 'contrafile', 'costela', 'acem', 'patinho',
      'maminha', 'coxao', 'coxão', 'bisteca', 'lombo', 'pernil', 'bacon', 'calabresa',
      'tilapia', 'tilápia', 'salmao', 'salmão', 'sardinha', 'camarao', 'camarão', 'bacalhau',
      'pescada', 'merluza', 'atum fresco', 'salsicha', 'hamburguer', 'hambúrguer', 'nugget',
      'coxa', 'sobrecoxa', 'peito frango', 'filezinho', 'sassami', 'moida', 'moída',
      'figado', 'fígado', 'coracao', 'coração'
    ]
  },
  // 2. Alimentação - bebidas
  {
    tipo: 'Alimentação',
    produto: 'bebidas',
    detalhe: 'suco, vinho, refrigerante, cerveja, chá, leite',
    keywords: [
      'suco', 'vinho', 'refrigerante', 'cerveja', 'chá', 'cha', 'leite',
      'nectar', 'néctar', 'refri', 'coca cola', 'coca-cola', 'coca', 'guarana', 'guaraná',
      'fanta', 'sprite', 'pepsi', 'schweppes', 'heineken', 'amstel', 'stella', 'skol',
      'brahma', 'budweiser', 'corona', 'bohemia', 'espumante', 'vodka', 'gin', 'whisky',
      'cachaça', 'cachaca', 'rum', 'licor', 'agua mineral', 'água mineral', 'agua c/ gas',
      'agua sem gas', 'agua tonica', 'água tônica', 'energetico', 'energético', 'red bull',
      'monster', 'gatorade', 'powerade', 'isotônico', 'isotonico', 'leite uht', 'leite integral',
      'leite desnatado', 'leite semi', 'leite cond', 'achocolatado pronto', 'toddynho'
    ]
  },
  // 3. Alimentação - hortifrúti
  {
    tipo: 'Alimentação',
    produto: 'hortifrúti',
    detalhe: 'fruta, verdura, legume, alho, batata',
    keywords: [
      'fruta', 'verdura', 'legume', 'alho', 'batata', 'tomate', 'cebola', 'cenoura',
      'banana', 'maca', 'maçã', 'laranja', 'limao', 'limão', 'alface', 'couve',
      'brocolis', 'brócolis', 'abobora', 'abóbora', 'abobrinha', 'berinjela',
      'mandioca', 'aipim', 'beterraba', 'melancia', 'melao', 'melão', 'uva', 'manga',
      'mamao', 'mamão', 'abacaxi', 'pera', 'pêra', 'morango', 'kiwi', 'maracuja', 'maracujá',
      'salsa', 'cebolinha', 'cheiro verde', 'coentro', 'rucula', 'rúcula', 'espinafre',
      'pimentao', 'pimentão', 'repolho', 'chuchu', 'pepino', 'vagem', 'quiabo', 'jilo', 'jiló',
      'mandioca', 'inhame', 'batata doce', 'hortifru', 'legumes'
    ]
  },
  // 4. Alimentação - laticínios e frios
  {
    tipo: 'Alimentação',
    produto: 'laticínios e frios',
    detalhe: 'queijo, presunto, queijo ralado, requeijão, leite em pó, manteiga, margarina',
    keywords: [
      'queijo', 'presunto', 'queijo ralado', 'requeijao', 'requeijão', 'leite em po', 'leite em pó',
      'manteiga', 'margarina', 'mussarela', 'mozarela', 'prato', 'provolone', 'parmesao',
      'parmesão', 'gorgonzola', 'minas frescal', 'minas padrao', 'ricota', 'brie', 'cheddar',
      'mortadela', 'peito de peru', 'salame', 'copa', 'iogurte', 'yogurte', 'iog', 'danone',
      'yakult', 'nata', 'coalhada', 'creme de leite', 'leite condensado', 'chantilly',
      'leite de coco'
    ]
  },
  // 5. Alimentação - mercearia
  {
    tipo: 'Alimentação',
    produto: 'mercearia',
    detalhe: 'secos, molhados, entalado, tempero',
    keywords: [
      'secos', 'molhados', 'entalado', 'enlatado', 'tempero', 'arroz', 'feijao', 'feijão',
      'macarrao', 'macarrão', 'massa', 'espaguete', 'penne', 'parafuso', 'oleo', 'óleo',
      'oleo soja', 'azeite', 'acucar', 'açúcar', 'sal refinado', 'sal grosso', 'cafe', 'café',
      'cafe moido', 'cafe soluvel', 'farinha', 'trigo', 'fubá', 'fuba', 'aveia', 'maionese',
      'ketchup', 'mostarda', 'molho', 'molho tomate', 'extrato tomate', 'polpa tomate',
      'ervilha', 'milho verde', 'sardinha lata', 'atum lata', 'palmito', 'azeitona',
      'caldo knorr', 'caldo maggi', 'sazon', 'pimenta', 'oregano', 'orégano', 'vinagre',
      'fermento', 'achocolatado po', 'nescau', 'toddy', 'cereal', 'granola', 'amido', 'maisena',
      'gelatina', 'mistura bolo', 'lentilha', 'grao de bico', 'grão de bico', 'canjica',
      'polvilho', 'tapioca'
    ]
  },
  // 6. Alimentação - padaria
  {
    tipo: 'Alimentação',
    produto: 'padaria',
    detalhe: 'pão, pão de queijo, rosca, bolacha, biscoito, salgadinho',
    keywords: [
      'pao', 'pão', 'pao de queijo', 'pão de queijo', 'rosca', 'bolacha', 'biscoito',
      'salgadinho', 'pao frances', 'pão francês', 'pao de forma', 'pao forma', 'torrada',
      'bolo', 'croissant', 'brioche', 'broa', 'sonho', 'torta doce', 'cookie', 'wafer',
      'recheado', 'passatempo', 'trakinas', 'oreo', 'club social', 'pit stop', 'cream cracker',
      'maisena biscoito', 'ruffles', 'doritos', 'cheetos', 'fandangos', 'batata palha',
      'salgado', 'coxinha', 'esfirra', 'kibe', 'pastel', 'empada'
    ]
  },
  // 7. Higiene Pessoal - bucal
  {
    tipo: 'Higiene Pessoal',
    produto: 'bucal',
    detalhe: 'creme dental, escova de dente, enxaguante bucal e fio dental',
    keywords: [
      'creme dental', 'escova de dente', 'escova dental', 'enxaguante bucal', 'enxaguatorio',
      'enxaguatório', 'fio dental', 'fita dental', 'pasta de dente', 'pasta dental',
      'colgate', 'oral b', 'oral-b', 'sensodyne', 'sorriso', 'close up', 'listerine',
      'plax', 'cepacol', 'fixador dentadura', 'corega'
    ]
  },
  // 8. Higiene Pessoal - capilar
  {
    tipo: 'Higiene Pessoal',
    produto: 'capilar',
    detalhe: 'shampoo, condicionador, creme para cabelo, pente, escova de cabelo',
    keywords: [
      'shampoo', 'xampu', 'condicionador', 'creme para cabelo', 'creme capilar',
      'pente', 'escova de cabelo', 'mascara capilar', 'máscara capilar', 'masc cap',
      'leave in', 'leave-in', 'tintura cabelo', 'tonalizante', 'gel fixador', 'gel cabelo',
      'pomada cabelo', 'reparador pontas', 'oleo capilar', 'seda', 'pantene', 'elseve',
      'head shoulders', 'tresemme', 'salon line'
    ]
  },
  // 9. Higiene Pessoal - corporal
  {
    tipo: 'Higiene Pessoal',
    produto: 'corporal',
    detalhe: 'desodorante, cotonete, sabonete, hidratante, óleos',
    keywords: [
      'desodorante', 'cotonete', 'hastes flexiveis', 'hastes flexíveis', 'sabonete',
      'sabonete barra', 'hidratante corporal', 'oleos', 'óleos', 'oleo corporal',
      'talco', 'esponja banho', 'rexona', 'dove sabonete', 'dove desod', 'nivea hidratante',
      'protex', 'lux', 'palmolive', 'giovanna baby', 'antitranspirante', 'roll on',
      'aerossol corpo', 'sabonete nivea'
    ]
  },
  // 10. Higiene Pessoal - íntima e papéis
  {
    tipo: 'Higiene Pessoal',
    produto: 'íntima e papéis',
    detalhe: 'absorventes, hidratante, protetor solar, sabonete íntimo, papel higiênico, lenço de papel, lenço umedecido',
    keywords: [
      'absorventes', 'absorvente', 'protetor diario', 'protetor diário', 'sabonete intimo',
      'sabonete íntimo', 'papel higienico', 'papel higiênico', 'lenco de papel', 'lenço de papel',
      'lenco umedecido', 'lenço umedecido', 'lencos umedecidos', 'toalha umedecida',
      'papel hig', 'sempre livre', 'intimus', 'kotex', 'neve papel', 'sublime',
      'personal papel', 'preservativo', 'camisinha', 'fralda'
    ]
  },
  // 11. Higiene Pessoal - mãos/pés
  {
    tipo: 'Higiene Pessoal',
    produto: 'mãos/pés',
    detalhe: 'creme p/ mãos, creme p/ pés, sabonete líquido, álcool em gel',
    keywords: [
      'creme p/ maos', 'creme para maos', 'creme p/ mãos', 'creme para mãos',
      'creme p/ pes', 'creme para pes', 'creme p/ pés', 'creme para pés',
      'sabonete liquido', 'sabonete líquido', 'alcool em gel', 'álcool em gel',
      'gel antisseptico', 'gel antisséptico', 'lixa unha', 'lixa pe', 'cortador unha',
      'alicate cuticula', 'esmalte', 'removedor esmalte', 'acetona', 'algodao', 'algodão'
    ]
  },
  // 12. Higiene Pessoal - pele/barbear
  {
    tipo: 'Higiene Pessoal',
    produto: 'pele/barbear',
    detalhe: 'protetores solares, limpadores faciais, barbeador',
    keywords: [
      'protetores solares', 'protetor solar', 'limpadores faciais', 'barbeador',
      'gillette', 'prestobarba', 'aparelho barbear', 'aparelho de barbear', 'lamina barbear',
      'lâmina barbear', 'espuma barbear', 'espuma de barbear', 'gel barbear',
      'pos barba', 'pós barba', 'agua micelar', 'água micelar', 'sabonete facial',
      'esfoliante facial', 'protetor facial', 'sundown', 'neutrogena facial', 'loreal solar'
    ]
  },
  // 13. Limpeza Doméstica - descartáveis
  {
    tipo: 'Limpeza Doméstica',
    produto: 'descartáveis',
    detalhe: 'papel filme, papel toalha, filtro café, papel alumínio, guardanapos, pratinhos, copo, luvas',
    keywords: [
      'papel filme', 'filme pvc', 'papel toalha', 'filtro cafe', 'filtro café',
      'filtro de cafe', 'coador cafe', 'papel aluminio', 'papel alumínio', 'folha aluminio',
      'guardanapos', 'guardanapo', 'pratinhos', 'prato descartavel', 'copo descartavel',
      'copos descartaveis', 'luvas descartaveis', 'luva latex', 'luva vinil', 'canudo',
      'palito dente', 'palito de dente', 'forminha', 'marmitex', 'saco freezer', 'saco zip'
    ]
  },
  // 14. Limpeza Doméstica - acessórios
  {
    tipo: 'Limpeza Doméstica',
    produto: 'acessórios',
    detalhe: 'esponja, pano de limpeza, saco de lixo, escova limpeza',
    keywords: [
      'esponja', 'esponja dupla', 'esponja aco', 'esponja de aço', 'bombril', 'assolan',
      'pano de limpeza', 'pano limpeza', 'pano microfibra', 'pano prato', 'pano de chao',
      'pano de chão', 'perfex', 'saco de lixo', 'saco lixo', 'escova limpeza', 'escova vaso',
      'vassoura', 'rodo', 'balde', 'pa de lixo', 'pá de lixo', 'pregador roupa', 'varal',
      'mop', 'luva limpeza'
    ]
  },
  // 15. Limpeza Doméstica - desinfetantes
  {
    tipo: 'Limpeza Doméstica',
    produto: 'desinfetantes',
    detalhe: 'água sanitária, desinfetante, alcool, removedor',
    keywords: [
      'agua sanitaria', 'água sanitária', 'desinfetante', 'alcool', 'álcool',
      'alcool 70', 'álcool 70', 'removedor', 'cloro', 'candida', 'cândida', 'kiboa',
      'pinho sol', 'pinhosol', 'lisoform', 'lysoform', 'desinfetante veja', 'querosene',
      'sanitizante', 'agua sanit'
    ]
  },
  // 16. Limpeza Doméstica - detergentes
  {
    tipo: 'Limpeza Doméstica',
    produto: 'detergentes',
    detalhe: 'lava louça, limpa alumínio, detergente, limpa móveis',
    keywords: [
      'lava louca', 'lava louça', 'limpa aluminio', 'limpa alumínio', 'detergente',
      'detergente liquido', 'limpa moveis', 'limpa móveis', 'lustra moveis',
      'veja multiuso', 'veja', 'saponaceo', 'saponáceo', 'cif', 'limpa vidro',
      'limpa forno', 'desengordurante', 'multiuso', 'pastilha lava louca', 'secar lava louca'
    ]
  },
  // 17. Limpeza Doméstica - inseticidas
  {
    tipo: 'Limpeza Doméstica',
    produto: 'inseticidas',
    detalhe: 'aerosol, iscas, raticidas, veneno insetos',
    keywords: [
      'inseticida', 'aerosol insetos', 'aerossol insetos', 'iscas', 'iscas barata',
      'iscas formiga', 'raticidas', 'raticida', 'veneno insetos', 'veneno barata',
      'raid', 'baygon', 'sbp', 'mata barata', 'mata mosquito', 'repelente inseto',
      'pastilha pernilongo', 'veneno rato'
    ]
  },
  // 18. Limpeza Doméstica - lava roupas
  {
    tipo: 'Limpeza Doméstica',
    produto: 'lava roupas',
    detalhe: 'amaciantes, sabão em pó, sabão líquido, alvejantes',
    keywords: [
      'amaciante', 'amaciantes', 'sabao em po', 'sabão em pó', 'sabao liquido',
      'sabão líquido', 'sabao em barra', 'sabão em barra', 'alvejante', 'alvejantes',
      'omo', 'ariel', 'confort', 'comfort', 'downy', 'vanish', 'tixan', 'ype amaciante',
      'brilhante sabao', 'brilhante po', 'tira manchas', 'amaciante concentrado'
    ]
  }
];

export const TIPO_OPTIONS = [
  'Todos',
  'Alimentação',
  'Higiene Pessoal',
  'Limpeza Doméstica',
  'Outros'
] as const;

/**
 * Normalize string by removing accents, lowercase and trimming punctuation
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
 * Classifies an item based on its description
 */
export function classifyProduct(descricao: string): {
  tipo: string;
  produto: string;
  detalhe: string;
} {
  if (!descricao) {
    return {
      tipo: 'Outros',
      produto: 'Outros',
      detalhe: 'Não categorizado'
    };
  }

  const normalized = normalizeText(descricao);

  // Check each rule in sequence
  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      const normKeyword = normalizeText(keyword);
      // Check word boundary or substring match
      if (normKeyword && normalized.includes(normKeyword)) {
        return {
          tipo: rule.tipo,
          produto: rule.produto,
          detalhe: rule.detalhe
        };
      }
    }
  }

  // Fallback to "Outros"
  return {
    tipo: 'Outros',
    produto: 'Outros',
    detalhe: 'Outros'
  };
}
