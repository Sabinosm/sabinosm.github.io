export function setError(fieldId, message) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  const field = input.closest(".field");
  const errEl = document.getElementById("err-" + fieldId);
  if (field) field.classList.add("has-error");
  if (errEl) errEl.textContent = message;
}

export function clearError(fieldId) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  const field = input.closest(".field");
  const errEl = document.getElementById("err-" + fieldId);
  if (field) field.classList.remove("has-error");
  if (errEl) errEl.textContent = "";
}

export function temErro(fieldId) {
  return !!document.getElementById(fieldId)?.closest(".field")?.classList.contains("has-error");
}

/**
 * Pinta { campo: msg } nos inputs. `campo` pode vir com hífen (alias do back)
 * ou underscore; `idDe(campoNormalizado)` devolve o id do DOM.
 * Devolve { campo: msg } do que NÃO tem input (campos de outro form, _geral).
 */
export function pintarErros(erros, idDe = (c) => c, idsPermitidos = null) {
  const sobra = {};
  if (!erros || typeof erros !== "object") return sobra;
  for (const [campo, msg] of Object.entries(erros)) {
    const id = idDe(campo.replace(/-/g, "_"));
    const permitido = !idsPermitidos || idsPermitidos.includes(id);
    if (id && permitido && document.getElementById(id)) setError(id, String(msg));
    else sobra[campo] = String(msg);
  }
  return sobra;
}

/** Plano B (back sem `erros` estruturado): "campo: msg; campo2: msg2". */
export function parseMensagemBackend(mensagem) {
  const erros = {};
  const restantes = [];
  (mensagem || "").split(";").forEach((parte) => {
    const trecho = parte.trim();
    if (!trecho) return;
    const idx = trecho.indexOf(":");
    if (idx === -1) restantes.push(trecho);
    else erros[trecho.slice(0, idx).trim()] = trecho.slice(idx + 1).trim();
  });
  return { erros, restantes };
}

/** Versão texto: pinta o que casa e devolve o restante como string única. */
export function pintarMensagemBackend(mensagem, idDe, idsPermitidos) {
  const { erros, restantes } = parseMensagemBackend(mensagem);
  const sobra = pintarErros(erros, idDe, idsPermitidos);
  // o que não casou volta no formato original, como as funções antigas faziam
  const naoCasados = Object.entries(sobra).map(([c, m]) => `${c}: ${m}`);
  return [...restantes, ...naoCasados].join("; ");
}

/** Liga blur + input condicional (só revalida digitando se já há erro visível). */
export function ligarCampo(id, validarUm) {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener("blur", () => validarUm(id));
  input.addEventListener("input", () => {
    if (temErro(id)) validarUm(id);
  });
}