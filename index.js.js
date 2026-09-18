/**
 * ==============================================================================
 * 🤖 BOT DE GERENCIAMENTO DE TAREFAS / CHAMADOS (DISCORD.JS V14 + SUPABASE)
 * Hospedagem: Render.com
 * ==============================================================================
 */

require('dotenv').config();
const http = require('http');
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// Servidor Web simples para satisfazer a verificação do Render.com
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.write("🤖 Bot de Tarefas do Discord está online e funcionando!");
  res.end();
}).listen(PORT, () => {
  console.log(`🌐 Servidor HTTP ativo na porta ${PORT} para o Render.`);
});

// Tratamento e higienização das variáveis de ambiente
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || '').trim();
const CLIENT_ID = (process.env.CLIENT_ID || '').trim();
const SUPABASE_KEY = (process.env.SUPABASE_KEY || '').trim().replace(/^["']|["']$/g, '');

// Limpeza rigorosa da SUPABASE_URL para evitar "Invalid path specified in request URL"
let SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '');
SUPABASE_URL = SUPABASE_URL.replace(/\/rest\/v1\/?$/i, ''); // Remove /rest/v1 se existir
SUPABASE_URL = SUPABASE_URL.replace(/\/+$/, ''); // Remove barras no final

const LOGO_URL = (process.env.LOGO_URL || '').trim();

if (!DISCORD_TOKEN || !CLIENT_ID || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Erro: Certifique-se de configurar DISCORD_TOKEN, CLIENT_ID, SUPABASE_URL e SUPABASE_KEY nas variáveis de ambiente!");
  process.exit(1);
}

console.log(`🔗 Conectando ao Supabase na URL: ${SUPABASE_URL}`);

// Inicializando Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Inicializando Cliente Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// Helper para obter a URL da logo
function getBotLogo() {
  if (LOGO_URL) return LOGO_URL;
  return client.user?.displayAvatarURL({ dynamic: true, size: 512 }) || null;
}

// Helper para calcular tempo relativo
function getRelativeTime(dateString) {
  if (!dateString) return 'desconhecido';
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'agora mesmo';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  return `há ${diffDays}d`;
}

// Map de Emojis de Prioridade
const priorityEmojis = {
  urgente: '🔴 [URGENTE]',
  media: '🟡 [MÉDIA]',
  baixa: '🟢 [BAIXA]'
};

const commands = [
  // /tarefas
  new SlashCommandBuilder()
    .setName('tarefas')
    .setDescription('Exibe o painel de chamados/tarefas pendentes, em andamento e concluídas recentemente.'),

  // /criar_tarefa (com Prioridade)
  new SlashCommandBuilder()
    .setName('criar_tarefa')
    .setDescription('Cria um novo chamado / tarefa para uma empresa.')
    .addStringOption(opt => opt.setName('empresa').setDescription('Nome da empresa').setRequired(true))
    .addStringOption(opt => opt.setName('titulo').setDescription('Título do chamado/tarefa').setRequired(true))
    .addStringOption(opt => 
      opt.setName('prioridade')
        .setDescription('Nível de prioridade do chamado')
        .setRequired(false)
        .addChoices(
          { name: '🔴 Urgente', value: 'urgente' },
          { name: '🟡 Média', value: 'media' },
          { name: '🟢 Baixa', value: 'baixa' }
        )
    )
    .addStringOption(opt => opt.setName('descricao').setDescription('Descrição detalhada do chamado').setRequired(false)),

  // /empresa (Filtro por empresa)
  new SlashCommandBuilder()
    .setName('empresa')
    .setDescription('Exibe todos os chamados ativos de uma empresa específica.')
    .addStringOption(opt => opt.setName('nome').setDescription('Nome da empresa para filtrar').setRequired(true)),

  // /log
  new SlashCommandBuilder()
    .setName('log')
    .setDescription('Exibe o histórico de todas as tarefas concluídas (com paginação).'),

  // /config_log
  new SlashCommandBuilder()
    .setName('config_log')
    .setDescription('Define o canal do Discord para enviar os logs de tarefas concluídas e lembretes.')
    .addChannelOption(opt => opt.setName('canal').setDescription('Selecione o canal de logs').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

client.once('ready', async () => {
  console.log(`✅ Bot conectado como: ${client.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    console.log('🔄 Atualizando os Slash Commands na API do Discord...');

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );

    console.log('🚀 Slash Commands registrados com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
  }

  // Iniciar verificação automática de lembretes (a cada 30 minutos)
  startReminderChecker();
});

// ⏰ AUTOMACÃO DE LEMBRETES DE TAREFAS ESQUECIDAS
function startReminderChecker() {
  console.log('⏰ Sistema de lembrete automático ativado (checagem a cada 30 min).');
  
  setInterval(async () => {
    try {
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

      const { data: forgottenTasks, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('status', 'em_andamento')
        .lt('updated_at', fourHoursAgo);

      if (error || !forgottenTasks || forgottenTasks.length === 0) return;

      const { data: settings } = await supabase
        .from('log_settings')
        .select('*');

      if (!settings || settings.length === 0) return;

      for (const task of forgottenTasks) {
        const priorityTag = priorityEmojis[task.priority || 'media'];
        const assignedUser = task.assigned_to_id ? `<@${task.assigned_to_id}>` : (task.assigned_to_name || 'Atendente');
        const timeAgo = getRelativeTime(task.updated_at);

        const reminderEmbed = new EmbedBuilder()
          .setTitle('⚠️ Lembrete de Chamado Parado!')
          .setColor('#FEE75C')
          .setDescription(`O chamado **#${task.id} - ${task.title}** está em andamento sem atualizações ${timeAgo}.`)
          .addFields(
            { name: '🏢 Empresa', value: task.company, inline: true },
            { name: '🚨 Prioridade', value: priorityTag, inline: true },
            { name: '👤 Responsável', value: assignedUser, inline: true }
          )
          .setFooter({ text: 'Por favor, atualize ou conclua o chamado assim que possível!' })
          .setTimestamp();

        for (const setting of settings) {
          try {
            const guild = await client.guilds.fetch(setting.guild_id);
            if (guild) {
              const channel = await guild.channels.fetch(setting.log_channel_id);
              if (channel) {
                await channel.send({ content: `🔔 ${assignedUser}, lembrete do seu chamado!`, embeds: [reminderEmbed] });
              }
            }
          } catch (e) {
            console.error('Erro ao enviar lembrete:', e.message);
          }
        }

        await supabase
          .from('tasks')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', task.id);
      }
    } catch (err) {
      console.error('Erro na automação de lembretes:', err);
    }
  }, 30 * 60 * 1000);
}

// Função auxiliar para gerar o Embed do /tarefas
async function buildTasksEmbed() {
  const { data: activeTasks, error: activeErr } = await supabase
    .from('tasks')
    .select('*')
    .in('status', ['pendente', 'em_andamento'])
    .order('created_at', { ascending: false });

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentCompleted, error: recentErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'concluida')
    .gte('completed_at', twentyFourHoursAgo)
    .order('completed_at', { ascending: false });

  if (activeErr || recentErr) console.error('Erro ao buscar tarefas:', activeErr || recentErr);

  const logo = getBotLogo();

  const embed = new EmbedBuilder()
    .setTitle('📋 Painel de Chamados & Tarefas das Empresas')
    .setColor('#5865F2')
    .setDescription('Acompanhe abaixo os chamados em aberto, níveis de prioridade e responsáveis.')
    .setTimestamp()
    .setFooter({ text: 'Sistema de Gerenciamento de Tarefas', iconURL: logo || undefined });

  if (logo) embed.setThumbnail(logo);

  if (!activeTasks || activeTasks.length === 0) {
    embed.addFields({ name: '🟡 Tarefas em Andamento / Pendentes', value: 'Nenhuma tarefa pendente no momento! 🎉' });
  } else {
    let activeText = '';
    activeTasks.forEach(task => {
      const statusEmoji = task.status === 'em_andamento' ? '⏳ **[EM ANDAMENTO]**' : '🔴 **[PENDENTE]**';
      const prio = priorityEmojis[task.priority || 'media'];
      const assigned = task.assigned_to_id ? `<@${task.assigned_to_id}>` : '*Ninguém assumiu ainda*';
      const desc = task.description ? `\n> *${task.description}*` : '';

      activeText += `**#${task.id} - ${task.title}**\n🏢 **Empresa:** ${task.company} | ${prio}\n${statusEmoji} | **Responsável:** ${assigned}${desc}\n\n`;
    });

    embed.addFields({ name: '📌 Chamados em Aberto', value: activeText.slice(0, 1024) });
  }

  if (recentCompleted && recentCompleted.length > 0) {
    let completedText = '';
    recentCompleted.forEach(task => {
      const timeAgo = getRelativeTime(task.completed_at);
      const user = task.completed_by_id ? `<@${task.completed_by_id}>` : task.completed_by_name || 'Desconhecido';
      completedText += `✅ **#${task.id} - ${task.title}** (${task.company})\n└ Concluída por ${user} **${timeAgo}**\n`;
    });

    embed.addFields({ name: '🎉 Concluídas Recentemente (Últimas 24h)', value: completedText.slice(0, 1024) });
  } else {
    embed.addFields({ name: '🎉 Concluídas Recentemente', value: 'Nenhuma tarefa finalizada nas últimas 24h.' });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_assumir_tarefa').setLabel('📌 Assumir Tarefa').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_concluir_tarefa').setLabel('✅ Concluir Tarefa').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('btn_nova_tarefa').setLabel('➕ Nova Tarefa').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_atualizar_tarefas').setLabel('🔄 Atualizar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// Função auxiliar para gerar Embed do /log
async function buildLogEmbed(page = 1) {
  const itemsPerPage = 5;
  const start = (page - 1) * itemsPerPage;
  const end = start + itemsPerPage - 1;

  const { count, error: countErr } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'concluida');

  const { data: logs, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'concluida')
    .order('completed_at', { ascending: false })
    .range(start, end);

  if (error || countErr) console.error('Erro ao buscar logs:', error || countErr);

  const totalPages = Math.ceil((count || 0) / itemsPerPage) || 1;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const logo = getBotLogo();

  const embed = new EmbedBuilder()
    .setTitle('📜 Histórico Geral de Tarefas Concluídas (Logs)')
    .setColor('#2F3136')
    .setFooter({ text: `Página ${currentPage} de ${totalPages} • Total: ${count || 0} tarefas concluídas`, iconURL: logo || undefined })
    .setTimestamp();

  if (logo) embed.setThumbnail(logo);

  if (!logs || logs.length === 0) {
    embed.setDescription('Nenhuma tarefa foi concluída até o momento.');
  } else {
    let logContent = '';
    logs.forEach(task => {
      const completedBy = task.completed_by_id ? `<@${task.completed_by_id}>` : (task.completed_by_name || 'N/A');
      const dataStr = task.completed_at ? new Date(task.completed_at).toLocaleString('pt-BR') : 'Data N/A';
      const prio = priorityEmojis[task.priority || 'media'];

      logContent += `**[#${task.id}] ${task.title}** (${prio})\n` +
                     `🏢 **Empresa:** ${task.company}\n` +
                     `👤 **Concluído por:** ${completedBy}\n` +
                     `📅 **Data de Conclusão:** ${dataStr}\n` +
                     `───────────────────────\n`;
    });
    embed.setDescription(logContent);
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`log_page_${currentPage - 1}`).setLabel('◀ Anterior').setStyle(ButtonStyle.Primary).setDisabled(currentPage <= 1),
    new ButtonBuilder().setCustomId(`log_page_${currentPage + 1}`).setLabel('Próximo ▶').setStyle(ButtonStyle.Primary).setDisabled(currentPage >= totalPages),
    new ButtonBuilder().setCustomId('log_refresh').setLabel('🔄 Atualizar').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

client.on('interactionCreate', async (interaction) => {
  try {
    // --------------------------------------------------------------------------
    // 1. SLASH COMMANDS
    // --------------------------------------------------------------------------
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      if (commandName === 'tarefas') {
        await interaction.deferReply();
        const payload = await buildTasksEmbed();
        await interaction.editReply(payload);
        return;
      }

      if (commandName === 'criar_tarefa') {
        const empresa = interaction.options.getString('empresa');
        const titulo = interaction.options.getString('titulo');
        const prioridade = interaction.options.getString('prioridade') || 'media';
        const descricao = interaction.options.getString('descricao') || 'Sem descrição adicional';

        const { data, error } = await supabase
          .from('tasks')
          .insert([
            { company: empresa, title: titulo, priority: prioridade, description: descricao, status: 'pendente' }
          ])
          .select();

        if (error) {
          console.error('Erro ao criar tarefa via slash command:', error);
          await interaction.reply({ content: `❌ Erro no Supabase: \`${error.message || JSON.stringify(error)}\``, flags: 64 });
          return;
        }

        const task = data[0];
        const prioTag = priorityEmojis[task.priority || 'media'];
        await interaction.reply({
          content: `✅ Chamado **#${task.id} - ${task.title}** para a empresa **${task.company}** (${prioTag}) criado com sucesso! Use \`/tarefas\` para visualizar.`,
          ephemeral: false
        });
        return;
      }

      if (commandName === 'empresa') {
        await interaction.deferReply();
        const nomeEmpresa = interaction.options.getString('nome');

        const { data: companyTasks, error } = await supabase
          .from('tasks')
          .select('*')
          .ilike('company', `%${nomeEmpresa}%`)
          .in('status', ['pendente', 'em_andamento'])
          .order('id', { ascending: false });

        if (error) {
          console.error(error);
          await interaction.editReply(`❌ Erro ao buscar tarefas da empresa: \`${error.message}\``);
          return;
        }

        const logo = getBotLogo();
        const embed = new EmbedBuilder()
          .setTitle(`🏢 Chamados Ativos da Empresa: ${nomeEmpresa}`)
          .setColor('#3498DB')
          .setTimestamp()
          .setFooter({ text: 'Mhinfo Bot • Filtro por Empresa', iconURL: logo || undefined });

        if (logo) embed.setThumbnail(logo);

        if (!companyTasks || companyTasks.length === 0) {
          embed.setDescription(`Nenhum chamado pendente ou em andamento encontrado para "**${nomeEmpresa}**".`);
        } else {
          let text = '';
          companyTasks.forEach(t => {
            const status = t.status === 'em_andamento' ? '⏳ [EM ANDAMENTO]' : '🔴 [PENDENTE]';
            const prio = priorityEmojis[t.priority || 'media'];
            const assigned = t.assigned_to_id ? `<@${t.assigned_to_id}>` : '*Ninguém*';
            text += `**#${t.id} - ${t.title}**\nStatus: ${status} | Prioridade: ${prio}\nResponsável: ${assigned}\n───────────────────────\n`;
          });
          embed.setDescription(text.slice(0, 4096));
        }

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (commandName === 'log') {
        await interaction.deferReply();
        const payload = await buildLogEmbed(1);
        await interaction.editReply(payload);
        return;
      }

      if (commandName === 'config_log') {
        const channel = interaction.options.getChannel('canal');
        
        const { error } = await supabase
          .from('log_settings')
          .upsert({ guild_id: interaction.guildId, log_channel_id: channel.id });

        if (error) {
          console.error(error);
          await interaction.reply({ content: `❌ Erro no Supabase: \`${error.message}\``, flags: 64 });
          return;
        }

        await interaction.reply({ content: `✅ Canal de logs e lembretes definido para: ${channel}`, flags: 64 });
        return;
      }
    }

    // --------------------------------------------------------------------------
    // 2. BOTÕES
    // --------------------------------------------------------------------------
    if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId === 'btn_atualizar_tarefas') {
        await interaction.deferUpdate();
        const payload = await buildTasksEmbed();
        await interaction.editReply(payload);
        return;
      }

      if (customId === 'btn_nova_tarefa') {
        const modal = new ModalBuilder()
          .setCustomId('modal_nova_tarefa')
          .setTitle('➕ Criar Novo Chamado / Tarefa');

        const inputEmpresa = new TextInputBuilder()
          .setCustomId('input_empresa')
          .setLabel('Nome da Empresa')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: TechCorp Brasil')
          .setRequired(true);

        const inputTitulo = new TextInputBuilder()
          .setCustomId('input_titulo')
          .setLabel('Título da Tarefa / Problema')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: Ajustar integração de pagamentos')
          .setRequired(true);

        const inputPrio = new TextInputBuilder()
          .setCustomId('input_prioridade')
          .setLabel('Prioridade (urgente, media, baixa)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Digite: urgente, media ou baixa')
          .setRequired(false);

        const inputDesc = new TextInputBuilder()
          .setCustomId('input_descricao')
          .setLabel('Descrição Detalhada')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Descreva os detalhes da tarefa...')
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(inputEmpresa),
          new ActionRowBuilder().addComponents(inputTitulo),
          new ActionRowBuilder().addComponents(inputPrio),
          new ActionRowBuilder().addComponents(inputDesc)
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId === 'btn_assumir_tarefa') {
        const { data: openTasks } = await supabase
          .from('tasks')
          .select('*')
          .in('status', ['pendente', 'em_andamento'])
          .order('id', { ascending: false })
          .limit(25);

        if (!openTasks || openTasks.length === 0) {
          await interaction.reply({ content: '❌ Não há nenhuma tarefa em aberto para assumir.', flags: 64 });
          return;
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('select_assumir_tarefa')
          .setPlaceholder('Selecione uma tarefa para assumir...')
          .addOptions(
            openTasks.map(t => ({
              label: `#${t.id} - ${t.title.slice(0, 45)}`,
              description: `Empresa: ${t.company} | Prio: ${t.priority || 'media'}`,
              value: t.id.toString()
            }))
          );

        await interaction.reply({
          content: '👇 Escolha qual tarefa você deseja assumir:',
          components: [new ActionRowBuilder().addComponents(selectMenu)],
          flags: 64
        });
        return;
      }

      if (customId === 'btn_concluir_tarefa') {
        const { data: inProgress } = await supabase
          .from('tasks')
          .select('*')
          .in('status', ['pendente', 'em_andamento'])
          .order('id', { ascending: false })
          .limit(25);

        if (!inProgress || inProgress.length === 0) {
          await interaction.reply({ content: '❌ Não há nenhuma tarefa pendente para concluir.', flags: 64 });
          return;
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('select_concluir_tarefa')
          .setPlaceholder('Selecione uma tarefa para concluir...')
          .addOptions(
            inProgress.map(t => ({
              label: `#${t.id} - ${t.title.slice(0, 45)}`,
              description: `Empresa: ${t.company}`,
              value: t.id.toString()
            }))
          );

        await interaction.reply({
          content: '🎉 Escolha a tarefa que você finalizou:',
          components: [new ActionRowBuilder().addComponents(selectMenu)],
          flags: 64
        });
        return;
      }

      if (customId.startsWith('log_page_')) {
        const page = parseInt(customId.split('_')[2], 10) || 1;
        await interaction.deferUpdate();
        const payload = await buildLogEmbed(page);
        await interaction.editReply(payload);
        return;
      }

      if (customId === 'log_refresh') {
        await interaction.deferUpdate();
        const payload = await buildLogEmbed(1);
        await interaction.editReply(payload);
        return;
      }
    }

    // --------------------------------------------------------------------------
    // 3. SELECT MENUS
    // --------------------------------------------------------------------------
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'select_assumir_tarefa') {
        const taskId = interaction.values[0];

        const { data, error } = await supabase
          .from('tasks')
          .update({
            status: 'em_andamento',
            assigned_to_id: interaction.user.id,
            assigned_to_name: interaction.user.username,
            updated_at: new Date().toISOString()
          })
          .eq('id', taskId)
          .select();

        if (error || !data || data.length === 0) {
          await interaction.reply({ content: `❌ Erro ao assumir tarefa: \`${error?.message || 'Erro desconhecido'}\``, flags: 64 });
          return;
        }

        await interaction.update({
          content: `✅ Você assumiu a tarefa **#${taskId} - ${data[0].title}** da empresa **${data[0].company}**!`,
          components: []
        });
        return;
      }

      if (interaction.customId === 'select_concluir_tarefa') {
        const taskId = interaction.values[0];
        const now = new Date().toISOString();

        const { data, error } = await supabase
          .from('tasks')
          .update({
            status: 'concluida',
            completed_by_id: interaction.user.id,
            completed_by_name: interaction.user.username,
            completed_at: now,
            updated_at: now
          })
          .eq('id', taskId)
          .select();

        if (error || !data || data.length === 0) {
          await interaction.reply({ content: `❌ Erro ao concluir tarefa: \`${error?.message || 'Erro desconhecido'}\``, flags: 64 });
          return;
        }

        const task = data[0];

        await interaction.update({
          content: `🎉 Parabéns! Tarefa **#${taskId} - ${task.title}** da empresa **${task.company}** foi marcada como concluída!`,
          components: []
        });

        const { data: logSetting } = await supabase
          .from('log_settings')
          .select('log_channel_id')
          .eq('guild_id', interaction.guildId)
          .maybeSingle();

        if (logSetting && logSetting.log_channel_id) {
          try {
            const channel = await interaction.guild.channels.fetch(logSetting.log_channel_id);
            if (channel) {
              const logo = getBotLogo();
              const logEmbed = new EmbedBuilder()
                .setTitle('✅ Chamado Concluído!')
                .setColor('#57F287')
                .addFields(
                  { name: '🆔 ID / Título', value: `#${task.id} - ${task.title}`, inline: true },
                  { name: '🏢 Empresa', value: task.company, inline: true },
                  { name: '🚨 Prioridade', value: priorityEmojis[task.priority || 'media'], inline: true },
                  { name: '👤 Concluído por', value: `<@${interaction.user.id}> (${interaction.user.username})`, inline: false },
                  { name: '📅 Data/Hora', value: new Date(now).toLocaleString('pt-BR'), inline: false }
                )
                .setTimestamp();

              if (logo) logEmbed.setThumbnail(logo);

              await channel.send({ embeds: [logEmbed] });
            }
          } catch (e) {
            console.error('Não foi possível enviar log:', e);
          }
        }
        return;
      }
    }

    // --------------------------------------------------------------------------
    // 4. MODAIS
    // --------------------------------------------------------------------------
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'modal_nova_tarefa') {
        const empresa = interaction.fields.getTextInputValue('input_empresa');
        const titulo = interaction.fields.getTextInputValue('input_titulo');
        let prioInput = interaction.fields.getTextInputValue('input_prioridade') || 'media';
        prioInput = prioInput.toLowerCase().trim();
        
        if (!['urgente', 'media', 'baixa'].includes(prioInput)) {
          prioInput = 'media';
        }

        const descricao = interaction.fields.getTextInputValue('input_descricao') || 'Sem descrição adicional';

        const { data, error } = await supabase
          .from('tasks')
          .insert([
            { company: empresa, title: titulo, priority: prioInput, description: descricao, status: 'pendente' }
          ])
          .select();

        if (error) {
          console.error('Erro no modal do Supabase:', error);
          await interaction.reply({ content: `❌ Erro no Supabase via Modal: \`${error.message || JSON.stringify(error)}\``, flags: 64 });
          return;
        }

        const task = data[0];
        const prioTag = priorityEmojis[task.priority || 'media'];

        await interaction.reply({
          content: `✅ Chamado **#${task.id} - ${task.title}** para a empresa **${task.company}** (${prioTag}) criado com sucesso!`,
          ephemeral: false
        });
        return;
      }
    }

  } catch (err) {
    console.error('Erro no tratamento da interação:', err);
  }
});

client.login(DISCORD_TOKEN);
