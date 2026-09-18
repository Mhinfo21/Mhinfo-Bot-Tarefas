/**
 * MHINFO BOT - Gerenciamento de Tarefas / Chamados
 * Discord.js v14 + Supabase + Render
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
  PermissionFlagsBits,
  Events
} = require('discord.js');

const { createClient } = require('@supabase/supabase-js');

// -----------------------------------------------------------------------------
// SERVIDOR HTTP - Render
// -----------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('MHINFO BOT online!');
}).listen(PORT, () => {
  console.log(`🌐 Servidor HTTP ativo na porta ${PORT} para o Render.`);
});

// -----------------------------------------------------------------------------
// VARIÁVEIS DE AMBIENTE
// -----------------------------------------------------------------------------

const DISCORD_TOKEN = (process.env.DISCORD_TOKEN || '').trim();
const CLIENT_ID = (process.env.CLIENT_ID || '').trim();

const SUPABASE_KEY = (process.env.SUPABASE_KEY || '')
  .trim()
  .replace(/^["']|["']$/g, '');

let SUPABASE_URL = (process.env.SUPABASE_URL || '')
  .trim()
  .replace(/^["']|["']$/g, '');

SUPABASE_URL = SUPABASE_URL.replace(/\/rest\/v1\/?$/i, '');
SUPABASE_URL = SUPABASE_URL.replace(/\/+$/, '');

const LOGO_URL = (process.env.LOGO_URL || '').trim();

if (!DISCORD_TOKEN || !CLIENT_ID || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    '❌ Configure DISCORD_TOKEN, CLIENT_ID, SUPABASE_URL e SUPABASE_KEY no Render.'
  );
  process.exit(1);
}

console.log(`🔗 Conectando ao Supabase em: ${SUPABASE_URL}`);

// -----------------------------------------------------------------------------
// CLIENTES
// -----------------------------------------------------------------------------

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
});

// -----------------------------------------------------------------------------
// FUNÇÕES AUXILIARES
// -----------------------------------------------------------------------------

function getBotLogo() {
  if (LOGO_URL) return LOGO_URL;

  return client.user?.displayAvatarURL({ size: 512 }) || null;
}

function getRelativeTime(dateString) {
  if (!dateString) return 'tempo desconhecido';

  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'agora mesmo';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  return `há ${diffDays}d`;
}

function formatDateBR(dateString) {
  if (!dateString) return 'Data não disponível';

  return new Date(dateString).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo'
  });
}

function truncateText(value, maxLength) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

const priorityEmojis = {
  urgente: '🔴 [URGENTE]',
  media: '🟡 [MÉDIA]',
  baixa: '🟢 [BAIXA]'
};

function getPriorityLabel(priority) {
  return priorityEmojis[priority || 'media'] || priorityEmojis.media;
}

function getPriorityVisual(priority) {
  const priorities = {
    urgente: '🔴 **URGENTE**',
    media: '🟡 **Média**',
    baixa: '🟢 **Baixa**'
  };

  return priorities[priority || 'media'] || priorities.media;
}

// -----------------------------------------------------------------------------
// SLASH COMMANDS
// -----------------------------------------------------------------------------

const commands = [
  new SlashCommandBuilder()
    .setName('tarefas')
    .setDescription('Exibe o painel de chamados e tarefas.'),

  new SlashCommandBuilder()
    .setName('criar_tarefa')
    .setDescription('Cria um novo chamado ou tarefa para uma empresa.')
    .addStringOption(option =>
      option
        .setName('empresa')
        .setDescription('Nome da empresa')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('titulo')
        .setDescription('Título do chamado ou tarefa')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('prioridade')
        .setDescription('Nível de prioridade')
        .setRequired(false)
        .addChoices(
          { name: '🔴 Urgente', value: 'urgente' },
          { name: '🟡 Média', value: 'media' },
          { name: '🟢 Baixa', value: 'baixa' }
        )
    )
    .addStringOption(option =>
      option
        .setName('descricao')
        .setDescription('Descrição detalhada')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('empresa')
    .setDescription('Exibe os chamados ativos de uma empresa específica.')
    .addStringOption(option =>
      option
        .setName('nome')
        .setDescription('Nome da empresa')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('excluir_tarefa')
    .setDescription('Exclui uma tarefa do banco de dados. Apenas administradores.')
    .addIntegerOption(option =>
      option
        .setName('id')
        .setDescription('ID numérico da tarefa')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('log')
    .setDescription('Exibe o histórico de tarefas concluídas.'),

  new SlashCommandBuilder()
    .setName('config_log')
    .setDescription('Define o canal de logs e lembretes.')
    .addChannelOption(option =>
      option
        .setName('canal')
        .setDescription('Canal onde os logs serão enviados')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

// -----------------------------------------------------------------------------
// INICIALIZAÇÃO DO BOT
// -----------------------------------------------------------------------------

client.once(Events.ClientReady, async readyClient => {
  console.log(`✅ Bot conectado como: ${readyClient.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    console.log('🔄 Atualizando os Slash Commands na API do Discord...');

    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands.map(command => command.toJSON()) }
    );

    console.log('🚀 Slash Commands registrados com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:', error);
  }

  startReminderChecker();
});

// -----------------------------------------------------------------------------
// LEMBRETES AUTOMÁTICOS
// -----------------------------------------------------------------------------

let reminderCheckRunning = false;

function startReminderChecker() {
  console.log(
    '⏰ Lembretes automáticos ativados: aviso após 1 hora e checagem a cada 10 minutos.'
  );

  // Faz uma primeira verificação assim que o bot inicia.
  checkTaskReminders();

  setInterval(checkTaskReminders, 10 * 60 * 1000);
}

async function checkTaskReminders() {
  // Impede que duas verificações sejam executadas ao mesmo tempo.
  if (reminderCheckRunning) return;

  reminderCheckRunning = true;

  try {
    const oneHourAgo = new Date(
      Date.now() - 60 * 60 * 1000
    ).toISOString();

    const { data: forgottenTasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('status', 'em_andamento')
      .not('assigned_to_id', 'is', null)
      .lt('updated_at', oneHourAgo);

    if (error) {
      console.error('Erro ao buscar tarefas para os lembretes:', error);
      return;
    }

    if (!forgottenTasks || forgottenTasks.length === 0) return;

    const { data: settingsData, error: settingsError } = await supabase
      .from('log_settings')
      .select('*');

    if (settingsError) {
      console.error('Erro ao buscar configurações de log:', settingsError);
    }

    // Mesmo sem canal configurado, o bot ainda tentará enviar a mensagem privada.
    const settings = settingsError ? [] : (settingsData || []);

    for (const task of forgottenTasks) {
      const assignedMention = `<@${task.assigned_to_id}>`;

      const reminderEmbed = new EmbedBuilder()
        .setTitle('⏰ Lembrete de Tarefa em Andamento')
        .setColor('#FEE75C')
        .setDescription(
          `A tarefa **#${task.id} - ${task.title}** ainda não foi concluída ` +
          `e está em andamento ${getRelativeTime(task.updated_at)}.`
        )
        .addFields(
          {
            name: '🏢 Empresa',
            value: task.company || 'Não informada',
            inline: true
          },
          {
            name: '🚨 Prioridade',
            value: getPriorityLabel(task.priority),
            inline: true
          },
          {
            name: '👤 Responsável',
            value: assignedMention,
            inline: true
          }
        )
        .setFooter({
          text: 'Este é um lembrete automático da Central de Tarefas MH INFO.'
        })
        .setTimestamp();

      // Envia o lembrete no canal definido pelo comando /config_log.
      for (const setting of settings) {
        try {
          const guild = await client.guilds.fetch(setting.guild_id);
          const channel = await guild.channels.fetch(setting.log_channel_id);

          if (channel && channel.isTextBased()) {
            await channel.send({
              content:
                `🔔 ${assignedMention}, você ainda possui uma tarefa em andamento. ` +
                'Este é um lembrete para dar continuidade e concluí-la assim que possível.',
              embeds: [reminderEmbed],
              allowedMentions: {
                users: [task.assigned_to_id]
              }
            });
          }
        } catch (sendError) {
          console.error(
            `Erro ao enviar lembrete da tarefa #${task.id} no canal:`,
            sendError.message
          );
        }
      }

      // Envia também uma mensagem privada para quem assumiu a tarefa.
      try {
        const assignedUser = await client.users.fetch(task.assigned_to_id);

        const privateReminderEmbed = new EmbedBuilder()
          .setTitle('⏰ Você ainda possui uma tarefa em andamento')
          .setColor('#0099FF')
          .setDescription(
            `A tarefa **#${task.id} - ${task.title}** ainda não foi marcada como concluída.`
          )
          .addFields(
            {
              name: '🏢 Empresa',
              value: task.company || 'Não informada',
              inline: true
            },
            {
              name: '🚨 Prioridade',
              value: getPriorityLabel(task.priority),
              inline: true
            },
            {
              name: '⏱️ Tempo em andamento',
              value: getRelativeTime(task.updated_at),
              inline: true
            }
          )
          .setFooter({
            text: 'MH INFO • Central de Serviços'
          })
          .setTimestamp();

        await assignedUser.send({
          content:
            '🔔 Olá! Este é um lembrete automático sobre uma tarefa que você assumiu.',
          embeds: [privateReminderEmbed]
        });
      } catch (directMessageError) {
        console.error(
          `Não foi possível enviar mensagem privada para o responsável da tarefa #${task.id}:`,
          directMessageError.message
        );
      }

      // Reinicia a contagem. Se continuar aberta, haverá um novo aviso após 1 hora.
      const { error: updateError } = await supabase
        .from('tasks')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', task.id);

      if (updateError) {
        console.error(
          `Erro ao atualizar o horário do lembrete da tarefa #${task.id}:`,
          updateError
        );
      }
    }
  } catch (error) {
    console.error('Erro na automação de lembretes:', error);
  } finally {
    reminderCheckRunning = false;
  }
}

// -----------------------------------------------------------------------------
// PAINEL /tarefas - NOVO VISUAL MH INFO
// -----------------------------------------------------------------------------

async function buildTasksEmbed() {
  const { data: activeTasks, error: activeError } = await supabase
    .from('tasks')
    .select('*')
    .in('status', ['pendente', 'em_andamento'])
    .order('created_at', { ascending: false });

  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: recentCompleted, error: completedError } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'concluida')
    .gte('completed_at', twentyFourHoursAgo)
    .order('completed_at', { ascending: false });

  if (activeError || completedError) {
    console.error('Erro ao buscar tarefas:', activeError || completedError);
  }

  const tasks = activeTasks || [];
  const completed = recentCompleted || [];
  const pendingCount = tasks.filter(task => task.status === 'pendente').length;
  const progressCount = tasks.filter(task => task.status === 'em_andamento').length;
  const urgentCount = tasks.filter(task => task.priority === 'urgente').length;
  const logo = getBotLogo();

  const panelDescription =
    '**Tecnologia • Suporte • Infraestrutura**\n\n' +
    '## 🔵 TAREFAS EM ANDAMENTO\n' +
    `*${tasks.length} ${tasks.length === 1 ? 'chamado ativo' : 'chamados ativos'} no momento*\n\n` +
    `🔴 Urgentes: **${urgentCount}**  •  🟠 Pendentes: **${pendingCount}**  •  🔵 Em andamento: **${progressCount}**`;

  const embed = new EmbedBuilder()
    .setColor('#0099FF')
    .setTitle('⚡ 𝗠𝗛 𝗜𝗡𝗙𝗢 • CENTRAL DE TAREFAS')
    .setDescription(panelDescription)
    .setFooter({
      text: 'MH INFO • Central de Serviços',
      iconURL: logo || undefined
    })
    .setTimestamp();

  if (logo) embed.setThumbnail(logo);

  let usedCharacters =
    '⚡ 𝗠𝗛 𝗜𝗡𝗙𝗢 • CENTRAL DE TAREFAS'.length +
    panelDescription.length +
    'MH INFO • Central de Serviços'.length;
  let visibleTaskCount = 0;

  if (tasks.length === 0) {
    embed.addFields({
      name: '✅ TUDO EM DIA',
      value: 'Nenhuma tarefa pendente no momento! 🎉',
      inline: false
    });
  } else {
    // Mantém o embed abaixo do limite total de 6.000 caracteres do Discord.
    for (const task of tasks.slice(0, 12)) {
      const company = truncateText(
        String(task.company || 'EMPRESA NÃO INFORMADA').toUpperCase(),
        100
      );

      const assigned = task.assigned_to_id
        ? `<@${task.assigned_to_id}>`
        : task.assigned_to_name
          ? `**${truncateText(task.assigned_to_name, 80)}**`
          : '*Ninguém assumiu ainda*';

      const status = task.status === 'em_andamento'
        ? '🔵 **Em andamento**'
        : '🟠 **Pendente**';

      const description = task.description &&
        task.description !== 'Sem descrição adicional'
        ? `\n📄 ${truncateText(task.description, 180)}`
        : '';

      const fieldName = `🏢 ${company}  •  \`#${task.id}\``;
      const fieldValue = truncateText(
        `📝 **${truncateText(task.title || 'Tarefa sem título', 160)}**${description}\n\n` +
        `👤 Responsável: ${assigned}\n` +
        `🚨 Prioridade: ${getPriorityVisual(task.priority)}\n` +
        `⏱️ Status: ${status}\n` +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        700
      );

      // Reserva espaço para o resumo de concluídas e para o aviso de itens extras.
      if (usedCharacters + fieldName.length + fieldValue.length > 4550) break;

      embed.addFields({
        name: fieldName,
        value: fieldValue,
        inline: false
      });

      usedCharacters += fieldName.length + fieldValue.length;
      visibleTaskCount += 1;
    }

    if (tasks.length > visibleTaskCount) {
      const moreName = '📚 MAIS CHAMADOS';
      const moreValue =
        `Existem **${tasks.length - visibleTaskCount}** chamados adicionais. ` +
        'Use `/empresa` para consultar uma empresa específica.';

      embed.addFields({
        name: moreName,
        value: moreValue,
        inline: false
      });

      usedCharacters += moreName.length + moreValue.length;
    }
  }

  if (completed.length > 0) {
    const completedText = completed
      .slice(0, 5)
      .map(task => {
        const user = task.completed_by_id
          ? `<@${task.completed_by_id}>`
          : task.completed_by_name || 'Desconhecido';

        return (
          `✅ **#${task.id} - ${truncateText(task.title, 100)}** ` +
          `(${truncateText(task.company, 70)})\n` +
          `└ Concluída por ${user} **${getRelativeTime(task.completed_at)}**`
        );
      })
      .join('\n');

    const completedName = '🎉 CONCLUÍDAS NAS ÚLTIMAS 24H';
    const availableCharacters = Math.max(
      120,
      Math.min(1024, 5900 - usedCharacters - completedName.length)
    );

    if (availableCharacters >= 120) {
      embed.addFields({
        name: completedName,
        value: truncateText(completedText, availableCharacters),
        inline: false
      });
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_assumir_tarefa')
      .setLabel('📌 Assumir Tarefa')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_concluir_tarefa')
      .setLabel('✅ Concluir Tarefa')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('btn_nova_tarefa')
      .setLabel('➕ Nova Tarefa')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_atualizar_tarefas')
      .setLabel('🔄 Atualizar')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// -----------------------------------------------------------------------------
// HISTÓRICO /log
// -----------------------------------------------------------------------------

async function buildLogEmbed(page = 1) {
  const itemsPerPage = 5;

  const { count, error: countError } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'concluida');

  if (countError) console.error('Erro ao contar logs:', countError);

  const totalPages = Math.max(1, Math.ceil((count || 0) / itemsPerPage));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage - 1;

  const { data: logs, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('status', 'concluida')
    .order('completed_at', { ascending: false })
    .range(start, end);

  if (error) console.error('Erro ao buscar logs:', error);

  const logo = getBotLogo();
  const embed = new EmbedBuilder()
    .setTitle('📜 Histórico Geral de Tarefas Concluídas')
    .setColor('#2F3136')
    .setFooter({
      text: `Página ${currentPage} de ${totalPages} • Total: ${count || 0} tarefas concluídas`,
      iconURL: logo || undefined
    })
    .setTimestamp();

  if (logo) embed.setThumbnail(logo);

  if (!logs || logs.length === 0) {
    embed.setDescription('Nenhuma tarefa foi concluída até o momento.');
  } else {
    let content = '';

    for (const task of logs) {
      const completedBy = task.completed_by_id
        ? `<@${task.completed_by_id}>`
        : task.completed_by_name || 'N/A';

      content +=
        `**[#${task.id}] ${task.title}** (${getPriorityLabel(task.priority)})\n` +
        `🏢 **Empresa:** ${task.company}\n` +
        `👤 **Concluído por:** ${completedBy}\n` +
        `📅 **Data de Conclusão:** ${formatDateBR(task.completed_at)}\n` +
        '───────────────────────\n';
    }

    embed.setDescription(content.slice(0, 4096));
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`log_page_${currentPage - 1}`)
      .setLabel('◀ Anterior')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage <= 1),
    new ButtonBuilder()
      .setCustomId(`log_page_${currentPage + 1}`)
      .setLabel('Próximo ▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage >= totalPages),
    new ButtonBuilder()
      .setCustomId('log_refresh')
      .setLabel('🔄 Atualizar')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

// -----------------------------------------------------------------------------
// INTERAÇÕES
// -----------------------------------------------------------------------------

client.on(Events.InteractionCreate, async interaction => {
  try {
    // -------------------------------------------------------------------------
    // SLASH COMMANDS
    // -------------------------------------------------------------------------

    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      if (commandName === 'tarefas') {
        await interaction.deferReply();
        const payload = await buildTasksEmbed();
        await interaction.editReply(payload);
        return;
      }

      if (commandName === 'criar_tarefa') {
        await interaction.deferReply();

        const empresa = interaction.options.getString('empresa');
        const titulo = interaction.options.getString('titulo');
        const prioridade = interaction.options.getString('prioridade') || 'media';
        const descricao =
          interaction.options.getString('descricao') || 'Sem descrição adicional';

        const { data, error } = await supabase
          .from('tasks')
          .insert([{
            company: empresa,
            title: titulo,
            priority: prioridade,
            description: descricao,
            status: 'pendente'
          }])
          .select();

        if (error) {
          console.error('Erro ao criar tarefa:', error);
          await interaction.editReply(
            `❌ Erro no Supabase: \`${error.message || JSON.stringify(error)}\``
          );
          return;
        }

        const task = data[0];
        await interaction.editReply(
          `✅ Chamado **#${task.id} - ${task.title}** para a empresa ` +
          `**${task.company}** (${getPriorityLabel(task.priority)}) criado com sucesso! ` +
          'Use `/tarefas` para visualizar.'
        );
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
          console.error('Erro ao buscar empresa:', error);
          await interaction.editReply(
            `❌ Erro ao buscar tarefas: \`${error.message}\``
          );
          return;
        }

        const logo = getBotLogo();
        const embed = new EmbedBuilder()
          .setTitle(`🏢 Chamados Ativos da Empresa: ${nomeEmpresa}`)
          .setColor('#3498DB')
          .setTimestamp()
          .setFooter({
            text: 'MHINFO BOT • Filtro por Empresa',
            iconURL: logo || undefined
          });

        if (logo) embed.setThumbnail(logo);

        if (!companyTasks || companyTasks.length === 0) {
          embed.setDescription(
            `Nenhum chamado pendente ou em andamento encontrado para **${nomeEmpresa}**.`
          );
        } else {
          let content = '';

          for (const task of companyTasks) {
            const status = task.status === 'em_andamento'
              ? '⏳ [EM ANDAMENTO]'
              : '🔴 [PENDENTE]';
            const assigned = task.assigned_to_id
              ? `<@${task.assigned_to_id}>`
              : '*Ninguém*';

            content +=
              `**#${task.id} - ${task.title}**\n` +
              `Status: ${status} | Prioridade: ${getPriorityLabel(task.priority)}\n` +
              `Responsável: ${assigned}\n` +
              '───────────────────────\n';
          }

          embed.setDescription(content.slice(0, 4096));
        }

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (commandName === 'excluir_tarefa') {
        await interaction.deferReply({ flags: 64 });
        const taskId = interaction.options.getInteger('id');

        const { data, error } = await supabase
          .from('tasks')
          .delete()
          .eq('id', taskId)
          .select();

        if (error) {
          console.error('Erro ao excluir tarefa:', error);
          await interaction.editReply(
            `❌ Erro ao excluir do Supabase: \`${error.message}\``
          );
          return;
        }

        if (!data || data.length === 0) {
          await interaction.editReply(
            `⚠️ Nenhuma tarefa encontrada com o ID **#${taskId}**.`
          );
          return;
        }

        await interaction.editReply(
          `🗑️ Chamado **#${taskId} - ${data[0].title}** da empresa ` +
          `**${data[0].company}** foi excluído com sucesso!`
        );
        return;
      }

      if (commandName === 'log') {
        await interaction.deferReply();
        const payload = await buildLogEmbed(1);
        await interaction.editReply(payload);
        return;
      }

      if (commandName === 'config_log') {
        await interaction.deferReply({ flags: 64 });
        const channel = interaction.options.getChannel('canal');

        const { error } = await supabase
          .from('log_settings')
          .upsert({
            guild_id: interaction.guildId,
            log_channel_id: channel.id
          });

        if (error) {
          console.error('Erro ao configurar canal de log:', error);
          await interaction.editReply(`❌ Erro no Supabase: \`${error.message}\``);
          return;
        }

        await interaction.editReply(
          `✅ Canal de logs e lembretes definido para: ${channel}`
        );
        return;
      }
    }

    // -------------------------------------------------------------------------
    // BOTÕES
    // -------------------------------------------------------------------------

    if (interaction.isButton()) {
      const { customId } = interaction;

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
          .setPlaceholder('Ex: Parque Real')
          .setRequired(true);

        const inputTitulo = new TextInputBuilder()
          .setCustomId('input_titulo')
          .setLabel('Título da Tarefa / Problema')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: Computador sem acesso à internet')
          .setRequired(true);

        const inputPrioridade = new TextInputBuilder()
          .setCustomId('input_prioridade')
          .setLabel('Prioridade: urgente, media ou baixa')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Ex: media')
          .setRequired(false);

        const inputDescricao = new TextInputBuilder()
          .setCustomId('input_descricao')
          .setLabel('Descrição Detalhada')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Descreva os detalhes da tarefa...')
          .setRequired(false);

        modal.addComponents(
          new ActionRowBuilder().addComponents(inputEmpresa),
          new ActionRowBuilder().addComponents(inputTitulo),
          new ActionRowBuilder().addComponents(inputPrioridade),
          new ActionRowBuilder().addComponents(inputDescricao)
        );

        await interaction.showModal(modal);
        return;
      }

      if (customId === 'btn_assumir_tarefa') {
        await interaction.deferReply({ flags: 64 });

        const { data: openTasks, error } = await supabase
          .from('tasks')
          .select('*')
          .in('status', ['pendente', 'em_andamento'])
          .order('id', { ascending: false })
          .limit(25);

        if (error) {
          console.error('Erro ao buscar tarefas para assumir:', error);
          await interaction.editReply(
            `❌ Erro ao buscar tarefas: \`${error.message}\``
          );
          return;
        }

        if (!openTasks || openTasks.length === 0) {
          await interaction.editReply('❌ Não há nenhuma tarefa em aberto para assumir.');
          return;
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('select_assumir_tarefa')
          .setPlaceholder('Selecione uma tarefa para assumir...')
          .addOptions(openTasks.map(task => ({
            label: `#${task.id} - ${task.title}`.slice(0, 100),
            description:
              `Empresa: ${task.company} | Prioridade: ${task.priority || 'media'}`
                .slice(0, 100),
            value: String(task.id)
          })));

        await interaction.editReply({
          content: '👇 Escolha qual tarefa você deseja assumir:',
          components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
      }

      if (customId === 'btn_concluir_tarefa') {
        await interaction.deferReply({ flags: 64 });

        const { data: tasks, error } = await supabase
          .from('tasks')
          .select('*')
          .in('status', ['pendente', 'em_andamento'])
          .order('id', { ascending: false })
          .limit(25);

        if (error) {
          console.error('Erro ao buscar tarefas para concluir:', error);
          await interaction.editReply(
            `❌ Erro ao buscar tarefas: \`${error.message}\``
          );
          return;
        }

        if (!tasks || tasks.length === 0) {
          await interaction.editReply('❌ Não há nenhuma tarefa pendente para concluir.');
          return;
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('select_concluir_tarefa')
          .setPlaceholder('Selecione uma tarefa para concluir...')
          .addOptions(tasks.map(task => ({
            label: `#${task.id} - ${task.title}`.slice(0, 100),
            description: `Empresa: ${task.company}`.slice(0, 100),
            value: String(task.id)
          })));

        await interaction.editReply({
          content: '🎉 Escolha a tarefa que você finalizou:',
          components: [new ActionRowBuilder().addComponents(selectMenu)]
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

    // -------------------------------------------------------------------------
    // MENUS DE SELEÇÃO
    // -------------------------------------------------------------------------

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'select_assumir_tarefa') {
        await interaction.deferUpdate();
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
          await interaction.editReply({
            content:
              `❌ Erro ao assumir tarefa: \`${error?.message || 'Erro desconhecido'}\``,
            components: []
          });
          return;
        }

        await interaction.editReply({
          content:
            `✅ Você assumiu a tarefa **#${taskId} - ${data[0].title}** da empresa ` +
            `**${data[0].company}**!`,
          components: []
        });
        return;
      }

      if (interaction.customId === 'select_concluir_tarefa') {
        await interaction.deferUpdate();
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
          await interaction.editReply({
            content:
              `❌ Erro ao concluir tarefa: \`${error?.message || 'Erro desconhecido'}\``,
            components: []
          });
          return;
        }

        const task = data[0];

        await interaction.editReply({
          content:
            `🎉 Parabéns! Tarefa **#${taskId} - ${task.title}** da empresa ` +
            `**${task.company}** foi marcada como concluída!`,
          components: []
        });

        const { data: logSetting, error: logSettingError } = await supabase
          .from('log_settings')
          .select('log_channel_id')
          .eq('guild_id', interaction.guildId)
          .maybeSingle();

        if (logSettingError) {
          console.error('Erro ao buscar canal de log:', logSettingError);
        }

        if (logSetting?.log_channel_id) {
          try {
            const channel = await interaction.guild.channels.fetch(
              logSetting.log_channel_id
            );

            if (channel && channel.isTextBased()) {
              const logo = getBotLogo();
              const logEmbed = new EmbedBuilder()
                .setTitle('✅ Chamado Concluído!')
                .setColor('#57F287')
                .addFields(
                  {
                    name: '🆔 ID / Título',
                    value: `#${task.id} - ${task.title}`,
                    inline: true
                  },
                  {
                    name: '🏢 Empresa',
                    value: task.company,
                    inline: true
                  },
                  {
                    name: '🚨 Prioridade',
                    value: getPriorityLabel(task.priority),
                    inline: true
                  },
                  {
                    name: '👤 Concluído por',
                    value: `<@${interaction.user.id}> (${interaction.user.username})`,
                    inline: false
                  },
                  {
                    name: '📅 Data/Hora',
                    value: formatDateBR(now),
                    inline: false
                  }
                )
                .setTimestamp();

              if (logo) logEmbed.setThumbnail(logo);
              await channel.send({ embeds: [logEmbed] });
            }
          } catch (sendError) {
            console.error('Não foi possível enviar o log:', sendError);
          }
        }

        return;
      }
    }

    // -------------------------------------------------------------------------
    // MODAL DE NOVA TAREFA
    // -------------------------------------------------------------------------

    if (
      interaction.isModalSubmit() &&
      interaction.customId === 'modal_nova_tarefa'
    ) {
      await interaction.deferReply();

      const empresa = interaction.fields.getTextInputValue('input_empresa');
      const titulo = interaction.fields.getTextInputValue('input_titulo');
      const descricao =
        interaction.fields.getTextInputValue('input_descricao') ||
        'Sem descrição adicional';
      let prioridade =
        interaction.fields.getTextInputValue('input_prioridade') || 'media';

      prioridade = prioridade.toLowerCase().trim();

      if (!['urgente', 'media', 'baixa'].includes(prioridade)) {
        prioridade = 'media';
      }

      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          company: empresa,
          title: titulo,
          priority: prioridade,
          description: descricao,
          status: 'pendente'
        }])
        .select();

      if (error) {
        console.error('Erro no modal do Supabase:', error);
        await interaction.editReply(
          `❌ Erro no Supabase via Modal: \`${error.message || JSON.stringify(error)}\``
        );
        return;
      }

      const task = data[0];
      await interaction.editReply(
        `✅ Chamado **#${task.id} - ${task.title}** para a empresa ` +
        `**${task.company}** (${getPriorityLabel(task.priority)}) criado com sucesso!`
      );
    }
  } catch (error) {
    console.error('Erro no tratamento da interação:', error);

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: '❌ Ocorreu um erro inesperado ao processar esta ação.',
          flags: 64
        });
      } else {
        await interaction.reply({
          content: '❌ Ocorreu um erro inesperado ao processar esta ação.',
          flags: 64
        });
      }
    } catch (replyError) {
      console.error('Não foi possível responder ao erro:', replyError.message);
    }
  }
});

// -----------------------------------------------------------------------------
// LOGIN DO BOT
// -----------------------------------------------------------------------------

client.login(DISCORD_TOKEN);
