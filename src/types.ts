export interface NFCeItem {
  id: string;
  receiptId: string;
  num: number;
  descricao: string;
  qtd: number;
  unidade?: string;
  pesoKg?: number; // Peso em Kg para itens do tipo Alimentação
  precoPorKg?: number; // Preço R$/Kg calculado para itens do tipo Alimentação
  valorUnitario?: number;
  valorTotal: number; // Valor(R$)
  razaoSocial: string; // Nome / Razão Social
  data: string; // data da compra (YYYY-MM-DD or DD/MM/YYYY HH:mm)
  tipo: string; // Alimentação, Higiene Pessoal, Limpeza Doméstica, Outros
  produto: string; // e.g. açougue/Peixaria, bebidas, etc.
  detalhe: string; // e.g. carne, peixe, linguiça, etc.
}

export interface NFCeReceipt {
  id: string;
  chaveAcesso?: string;
  url?: string;
  razaoSocial: string;
  cnpj?: string;
  data: string;
  numeroNota?: string;
  serie?: string;
  valorTotal: number;
  itens: NFCeItem[];
  scannedAt: string;
  conferido?: 'Sim' | '-';
}

export interface CategoryRule {
  tipo: string;
  produto: string;
  detalhe: string;
  keywords: string[];
}

export interface ParseNFCeResponse {
  success: boolean;
  needsManualInput?: boolean;
  captchaDetected?: boolean;
  errorMessage?: string;
  url?: string;
  receipt?: {
    razaoSocial: string;
    cnpj?: string;
    data: string;
    numeroNota?: string;
    valorTotal: number;
    itens: {
      num: number;
      descricao: string;
      qtd: number;
      unidade?: string;
      valorUnitario?: number;
      valorTotal: number;
    }[];
  };
}
