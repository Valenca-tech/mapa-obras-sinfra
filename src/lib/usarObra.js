// Obra com a situação calculada, para a ficha do mapa e a página da Central.
// Obra ativa vem da lista já carregada; arquivada (ou link de outro
// ambiente) é buscada no servidor.
import { ref, computed, watch, toValue } from 'vue';
import { api } from '../api/index.js';
import { estado, obrasComSituacao, avisar } from '../estado.js';
import { calcularSituacao } from './situacao.js';

export function usarObra(id) {
  const foraDaLista = ref(null);
  const carregando = ref(true);
  const naoEncontrada = ref(false);

  const obra = computed(() => {
    const daLista = obrasComSituacao.value.find((o) => o.id === toValue(id));
    if (daLista) return daLista;
    const o = foraDaLista.value;
    if (!o || o.id !== toValue(id)) return null;
    return {
      ...o,
      situacao: calcularSituacao(o, {
        hoje: estado.hoje,
        tolerancia: estado.config.tolerancia_atraso_pontos,
        diasAlerta: estado.config.dias_sem_atualizacao_alerta,
      }),
    };
  });

  let seq = 0;
  async function carregar() {
    const n = ++seq;
    const alvo = toValue(id);
    carregando.value = true;
    try {
      if (!obrasComSituacao.value.some((o) => o.id === alvo)) {
        const o = await api.obter(alvo);
        if (n !== seq) return;
        foraDaLista.value = o;
        naoEncontrada.value = !o; // link antigo ou de outro ambiente
      } else {
        naoEncontrada.value = false;
      }
    } catch (e) {
      if (n === seq) avisar(e.message, 'erro');
    } finally {
      if (n === seq) carregando.value = false;
    }
  }

  watch(() => [toValue(id), estado.versao], carregar, { immediate: true });
  return { obra, carregando, naoEncontrada, carregar };
}
