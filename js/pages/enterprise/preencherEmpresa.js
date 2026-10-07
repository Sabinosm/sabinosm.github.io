// preencherEmpresa.js
//
// Preenche a UI da página Empresa (empresa.html) com os dados
// retornados por GET /empresas/ -> to_dict():
//   { uuid, nome_fantasia, razao_social, cnpj, cnes, status_plano,
//     plano, criado_em, endereco: { cep, bairro, numero, complemento } }
//
// Cada campo editável é UM único <input readonly>, com o valor atual
// dentro dele (não um par display/input). O modo de edição (esvaziar +
// usar o valor como placeholder) é responsabilidade de empresa.js,
// que já tem o controle de entrar/sair da edição -- aqui só preenchemos
// o estado inicial "de leitura".
//
// Segue o mesmo padrão de preencherPerfil.js: não busca dado nenhum
// sozinho -- recebe o payload já pronto e só decide "onde exibir o quê".

const CAMPOS_ENDERECO_SIMPLES = ['bairro', 'numero', 'complemento'];

/**
 * Preenche os campos institucionais e de plano a partir do payload de /empresas/.
 * @param {object} empresa - payload de to_dict() (ver cabeçalho do arquivo)
 */
export function preencherPainelEmpresa(empresa) {
  preencherDadosFixos(empresa);

  setValor('empresa-nome-fantasia', empresa.nome_fantasia);
  setValor('empresa-cnes', empresa.cnes);

  const endereco = empresa.endereco ?? {};
  setValor('empresa-cep', formatarCep(endereco.cep));
  CAMPOS_ENDERECO_SIMPLES.forEach((campo) => setValor(`empresa-${campo}`, endereco[campo]));

  preencherPlano(empresa);
}

function preencherDadosFixos(empresa) {
  const razaoSocial = document.getElementById('empresa-razao-social');
  const cnpj = document.getElementById('empresa-cnpj');

  if (razaoSocial) razaoSocial.textContent = empresa.razao_social ?? '—';
  if (cnpj) cnpj.textContent = formatarCnpj(empresa.cnpj);
}

function setValor(id, valor) {
  const input = document.getElementById(id);
  if (input) input.value = valor ?? '';
}

function preencherPlano(empresa) {
  const planoNome = document.getElementById('empresa-plano-nome');
  const planoStatus = document.getElementById('empresa-plano-status');

  if (planoNome) planoNome.textContent = empresa.plano ?? '—';
  // status_plano vem cru da API (ex.: "ativo", "inadimplente", "cancelado") --
  // por ora só formata capitalização; trocar por um mapa de labels/badges
  // quando os status finais forem definidos no backend.
  if (planoStatus) planoStatus.textContent = formatarStatusPlano(empresa.status_plano);
}

/**
 * Lê os campos editáveis do formulário e monta o payload para o PUT.
 * Um campo deixado vazio pelo usuário (placeholder ainda visível, nada
 * digitado) mantém o valor original -- ver getValorEfetivo em
 * empresa.js, que resolve isso antes de chamar esta função.
 */
export function lerFormularioEmpresa() {
  const valor = (id) => document.getElementById(id)?.value.trim() ?? '';

  return {
    nome_fantasia: valor('empresa-nome-fantasia'),
    cnes: valor('empresa-cnes') || null,
    endereco: {
      cep: valor('empresa-cep'),
      bairro: valor('empresa-bairro'),
      numero: valor('empresa-numero'),
      complemento: valor('empresa-complemento') || null,
    },
  };
}

function formatarCnpj(cnpj) {
  if (!cnpj) return '—';
  const digitos = cnpj.replace(/\D/g, '');
  if (digitos.length !== 14) return cnpj; // já formatado ou formato inesperado -- exibe como veio
  return digitos.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function formatarCep(cep) {
  if (!cep) return '';
  const digitos = cep.replace(/\D/g, '');
  if (digitos.length !== 8) return cep;
  return digitos.replace(/(\d{5})(\d{3})/, '$1-$2');
}

function formatarStatusPlano(status) {
  if (!status) return '';
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
}