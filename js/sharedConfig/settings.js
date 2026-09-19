// ============================================
// B-íon — Modal de Configurações
// Save/Cancel agora é POR PAINEL (não global).
// Cada painel decide se participa do fluxo salvar/cancelar
// adicionando [data-savable] na sua <section class="settings-panel">.
// Painéis sem [data-savable] (ex: Segurança) nunca mostram a save-bar,
// pois cada ação lá (remover dispositivo, trocar senha) já é
// destrutiva/imediata e não passa por "salvar em lote".
//
// Este arquivo é só o ponto de entrada: a lógica vive em ./settingsHelpers/
//   settingsFeedback.js  -> mensagens de sucesso/erro do modal
//   settingsApi.js       -> montagem do payload e chamada PUT /configuracoes/
//   settingsPaineis.js   -> estado por painel, save-bar, tema, cancelar/salvar
//   settingsModal.js     -> abrir/fechar modal e abas
//   settingsTotp.js      -> modal de cadastro de TOTP
//   settingsSenha.js     -> modal de alterar senha
//   settingsArquivos.js  -> painel de arquivos (visualizar/baixar)
//
// A ordem dos imports abaixo preserva a ordem em que o código rodava
// quando tudo vivia neste arquivo.
// ============================================

import './settingsHelpers/settingsFeedback.js';
import './settingsHelpers/settingsApi.js';
import './settingsHelpers/settingsPaineis.js';
import './settingsHelpers/settingsModal.js';
import './settingsHelpers/settingsTotp.js';
import './settingsHelpers/settingsSenha.js';
import './settingsHelpers/settingsArquivos.js';

// Mantém a API pública que preencherTotp.js já importa de settings.js
export { abrirModalTotp, fecharModalTotp, refsFormTotp } from './settingsHelpers/settingsTotp.js';