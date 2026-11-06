# Desafio Ósseo — versão online sem banco de dados

## O que esta versão faz
- O professor cria a sala e cadastra as perguntas no navegador.
- Cada pergunta tem quatro alternativas e uma resposta correta.
- Os alunos entram pelo navegador usando código da sala e nome.
- A partida funciona entre redes diferentes porque os aparelhos se conectam a um servidor online.
- Cada acerto vale de 600 a 1.000 pontos, de acordo com o tempo de resposta (janela de 15 segundos). Erro vale zero.
- O placar é atualizado em tempo real.
- Ao terminar, aparece o pódio com os três primeiros colocados.

## Importante
Não usa Firebase, Supabase nem banco de dados. As salas, perguntas e pontuações ficam somente na memória do processo do servidor. Se o servidor reiniciar ou entrar em suspensão, as partidas ativas são perdidas. Para partidas em redes diferentes, é necessário hospedar este servidor Node.js em um serviço online.

## Executar para teste
É necessário Node.js 18 ou superior.

```bash
npm install
npm start
```

Abra `http://localhost:3000` no computador para testar. Para testar com vários celulares na mesma rede, use o IP local do computador no navegador dos celulares.

## Publicar para uso pela internet
1. Crie um repositório Git com estes arquivos.
2. Publique como um serviço Web Node.js em um provedor de hospedagem compatível.
3. Comando de instalação: `npm install`
4. Comando de inicialização: `npm start`
5. Use a URL HTTPS pública fornecida pelo provedor.
6. O professor e os alunos abrem essa mesma URL em seus navegadores.

O servidor usa a variável `PORT` fornecida pela hospedagem. Não é necessário configurar banco de dados.

## Observações
- O anfitrião é o professor no navegador: ele cria a sala e controla o início/avanço/encerramento.
- O servidor online faz apenas a comunicação em tempo real; não é armazenamento permanente.
- O QR Code pode ser gerado pelo próprio navegador/celular a partir da URL pública e do código da sala. Nesta versão, o código da sala é mostrado na tela para compartilhamento.
- O código é uma versão inicial funcional; teste a hospedagem e o fluxo com um pequeno grupo antes de usar em aula.
