// i18n/pt-BR.js
export default {
  // ---- Ações genéricas ----
  'btn.salvar': 'Salvar',
  'btn.cancelar': 'Cancelar',
  'btn.confirmar': 'Confirmar',
  'btn.tentar_novamente': 'Tentar novamente',

  // ---- settingsApi.js ----
  'erro.salvar_configuracoes_generico': 'Não foi possível salvar as configurações. Tente novamente.',
  'erro.sem_conexao': 'Sem conexão com o servidor. Verifique sua internet e tente novamente.',

  // ---- settingsPaineis.js ----
  'sucesso.configuracoes_salvas': 'Configurações salvas com sucesso.',

  // ---- settingsArquivos.js ----
  'erro.abrir_documento': 'Não foi possível abrir o documento. Verifique se pop-ups estão bloqueados.',

  // ---- settingsSenha.js ----
  'senha.erro.nao_coincidem': 'As senhas não coincidem.',
  'senha.erro.confirmacao_expirada': 'Sua confirmação de identidade expirou. Feche e tente novamente.',
  'senha.erro.alterar_generico': 'Não foi possível alterar a senha. Tente novamente.',
  'senha.sucesso.alterada': 'Senha alterada com sucesso.',

  // ---- settingsTotp.js ----
  'totp.qrcode.falha_carregar': 'Não foi possível carregar o QR code agora -- use o código abaixo para configurar manualmente, ou recarregue a página e tente de novo.',
  'totp.secret.prefixo': 'Ou digite manualmente:',

  // ---- settingsModal.html — estrutura e aba User ----
  'settings.title': 'Configurações',
  'settings.tab.user': 'User',
  'settings.tab.seguranca': 'Segurança',
  'settings.tab.preferencias': 'Preferências',
  'settings.tab.arquivos': 'Arquivos',
  'settings.user.titulo': 'Informações básicas',
  'settings.user.subtitulo': 'Alguns dados são gerenciados pela sua instituição e não podem ser editados aqui.',
  'settings.user.alterar_foto': 'Alterar foto',
  'settings.user.foto_hint': 'JPG ou PNG, até 4MB.',
  'settings.user.nome': 'Nome',
  'settings.user.telefone': 'Telefone',
  'settings.user.email': 'E-mail',
  'settings.gerenciado_instituicao': 'Gerenciado pela instituição',

  // ---- settingsModal.html — aba Segurança ----
  'settings.seguranca.2fa_titulo': 'Autenticação em duas etapas',
  'settings.seguranca.2fa_descricao': 'Chave de acesso (WebAuthn) e aplicativo autenticador (TOTP) — cadastre pelo menos um destes para ativar a confirmação em duas etapas.',
  'settings.seguranca.adicionar_dispositivo': '+ Adicionar novo dispositivo',
  'settings.seguranca.totp_titulo': 'Aplicativo autenticador (TOTP)',
  'settings.seguranca.totp_descricao': 'Google Authenticator, Microsoft Authenticator ou similar — não depende de Bluetooth nem de porta USB, só do celular que você já carrega.',
  'settings.seguranca.totp_configurar': '+ Configurar aplicativo autenticador',
  'settings.seguranca.totp_remover': 'Remover',
  'settings.seguranca.senha_titulo': 'Senha',
  'settings.seguranca.senha_descricao': 'Usada como primeiro fator, junto ao login institucional.',
  'settings.seguranca.login_titulo': 'Login',
  'settings.seguranca.login_usuario': 'Usuário de login',

  // ---- settingsModal.html — aba Preferências ----
  'settings.pref.tema_titulo': 'Tema',
  'settings.pref.tema_descricao': 'Escolha o esquema de cores da aplicação.',
  'settings.pref.acessibilidade_titulo': 'Acessibilidade',
  'settings.pref.fonte_label': 'Tamanho da fonte',
  'settings.pref.fonte_pequena': 'Pequena',
  'settings.pref.fonte_padrao': 'Padrão',
  'settings.pref.fonte_grande': 'Grande',
  'settings.pref.idioma_titulo': 'Idioma',
  'settings.pref.idioma_label': 'Idioma da interface',

  // ---- settingsModal.html — aba Arquivos ----
  'settings.arquivos.titulo': 'Documentos',
  'settings.arquivos.descricao': 'Termos, políticas e outros documentos institucionais.',
  'settings.arquivos.termo_consentimento': 'Termos de Consentimento',
  'settings.arquivos.termo_uso': 'Termos de Uso',
  'settings.arquivos.visualizar': 'Visualizar',
  'settings.arquivos.baixar': 'Baixar',

  // ---- settingsModal.html — barra de salvar ----
  'settings.savebar.texto': 'Você tem alterações não salvas',
  'settings.savebar.salvar': 'Salvar alterações',

  // ---- settingsModal.html — modal TOTP ----
  'totp.nome': 'Aplicativo autenticador',
  'totp.modal.subtitulo': 'Escaneie o QR code no seu aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou similar), ou digite o código abaixo manualmente.',
  'totp.modal.carregando': 'Gerando código de configuração...',
  'totp.modal.codigo_label': 'Código gerado pelo aplicativo',

  // ---- settingsModal.html — modal Alterar senha ----
  'senha.alterar': 'Alterar senha',
  'senha.modal.subtitulo': 'Você precisará confirmar sua identidade antes de definir a nova senha.',
  'senha.nova': 'Nova senha',
  'senha.nova_hint': 'Mínimo de 12 caracteres.',
  'senha.confirmar_nova': 'Confirmar nova senha',

  // ---- stepupModal.html ----
  'stepup.titulo': 'Confirme sua identidade',
  'stepup.subtitulo_antes': 'Para continuar com',
  'stepup.subtitulo_depois': ', confirme novamente quem você é.',
  'stepup.carregando': 'Verificando método disponível...',
  'stepup.webauthn.hint': 'Use sua chave de segurança, PIN ou biometria do dispositivo quando solicitado pelo navegador.',
  'stepup.totp.hint': 'Não foi possível confirmar pela chave de segurança. Digite o código do seu aplicativo autenticador.',
  'stepup.totp.codigo_label': 'Código do autenticador',
  'stepup.senha.label': 'Senha atual',
  'stepup.senha.hint': 'Depois de confirmar sua senha, você entrará com sua conta Google em uma nova janela para concluir a confirmação.',
  'stepup.senha.confirmar': 'Confirmar senha',
};