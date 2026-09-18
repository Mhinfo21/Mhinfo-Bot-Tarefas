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
  Partials,
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
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Message,
    Partials.Channel
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

function formatDuration(startDate, endDate = new Date().toISOString()) {
  if (!startDate) return 'Tempo não disponível';

  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const totalMinutes = Math.max(0, Math.floor((end - start) / 60000));

  if (totalMinutes < 1) return 'Menos de 1 minuto';
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (totalHours < 24) {
    return minutes > 0
      ? `${totalHours}h ${minutes}min`
      : `${totalHours}h`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

function formatSecondsDuration(totalSecondsValue) {
  const totalSeconds = Math.max(0, Number(totalSecondsValue || 0));
  const totalMinutes = Math.floor(totalSeconds / 60);

  if (totalSeconds < 60) return `${Math.floor(totalSeconds)}s`;
  if (totalMinutes < 60) return `${totalMinutes}min`;

  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (totalHours < 24) {
    return minutes > 0
      ? `${totalHours}h ${minutes}min`
      : `${totalHours}h`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

const logChannelCache = new Map();

async function getConfiguredLogChannel(guild) {
  if (!guild) return null;

  let logChannelId;

  if (logChannelCache.has(guild.id)) {
    logChannelId = logChannelCache.get(guild.id);
  } else {
    const { data, error } = await supabase
      .from('log_settings')
      .select('log_channel_id')
      .eq('guild_id', guild.id)
      .maybeSingle();

    if (error) {
      console.error('Erro ao localizar o canal de auditoria:', error);
      return null;
    }

    logChannelId = data?.log_channel_id || null;
    logChannelCache.set(guild.id, logChannelId);
  }

  if (!logChannelId) return null;

  try {
    const channel =
      guild.channels.cache.get(logChannelId) ||
      await guild.channels.fetch(logChannelId);

    return channel?.isTextBased() ? channel : null;
  } catch (error) {
    console.error('Não foi possível acessar o canal de auditoria:', error.message);
    return null;
  }
}

async function sendAuditLog(guild, payload) {
  try {
    const channel = await getConfiguredLogChannel(guild);
    if (!channel) return false;

    await channel.send(payload);
    return true;
  } catch (error) {
    console.error('Erro ao enviar registro de auditoria:', error.message);
    return false;
  }
}

function flattenInteractionOptions(options = []) {
  const lines = [];

  for (const option of options) {
    if (option.options) {
      lines.push(...flattenInteractionOptions(option.options));
    } else {
      lines.push(`**${option.name}:** ${truncateText(option.value ?? 'não informado', 300)}`);
    }
  }

  return lines;
}

async function logInteractionAudit(interaction) {
  if (!interaction.guild || !interaction.user || interaction.user.bot) return;

  let actionType = 'Interação';
  let details = 'Sem detalhes adicionais.';

  if (interaction.isChatInputCommand()) {
    actionType = `Comando /${interaction.commandName}`;
    const options = flattenInteractionOptions(interaction.options.data);
    details = options.length > 0 ? options.join('\n') : 'Comando executado sem opções.';
  } else if (interaction.isButton()) {
    actionType = 'Clique em botão';
    details = `**Botão:** ${interaction.customId}`;
  } else if (interaction.isStringSelectMenu()) {
    actionType = 'Seleção em menu';
    details =
      `**Menu:** ${interaction.customId}\n` +
      `**Valor selecionado:** ${interaction.values.join(', ')}`;
  } else if (interaction.isModalSubmit()) {
    actionType = 'Formulário enviado';
    const fields = Array.from(interaction.fields.fields.values()).map(field =>
      `**${field.customId}:** ${truncateText(field.value || 'vazio', 500)}`
    );
    details = fields.join('\n') || 'Formulário sem campos.';
  } else {
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🖱️ Ação Registrada')
    .setColor('#5865F2')
    .addFields(
      {
        name: '👤 Pessoa',
        value: `<@${interaction.user.id}> (${interaction.user.username})`,
        inline: true
      },
      {
        name: '⚙️ Ação',
        value: truncateText(actionType, 1024),
        inline: true
      },
      {
        name: '📍 Canal',
        value: interaction.channelId ? `<#${interaction.channelId}>` : 'Não informado',
        inline: true
      },
      {
        name: '📋 Detalhes',
        value: truncateText(details, 1024),
        inline: false
      }
    )
    .setTimestamp();

  await sendAuditLog(interaction.guild, { embeds: [embed] });
}

async function sendTaskLifecycleLog(interaction, task, eventType) {
  if (!interaction.guild) return;

  const eventSettings = {
    assumida: {
      title: '📌 Tarefa Assumida',
      color: '#3498DB',
      actorLabel: 'Assumida por'
    },
    cancelada: {
      title: '🚫 Tarefa Cancelada',
      color: '#ED4245',
      actorLabel: 'Cancelada por'
    },
    pausada: {
      title: '⏸️ Tarefa Pausada',
      color: '#FEE75C',
      actorLabel: 'Pausada por'
    },
    retomada: {
      title: '▶️ Tarefa Retomada',
      color: '#57F287',
      actorLabel: 'Retomada por'
    },
    excluida: {
      title: '🗑️ Tarefa Excluída',
      color: '#992D22',
      actorLabel: 'Excluída por'
    }
  };

  const settings = eventSettings[eventType];
  if (!settings) return;

  const eventDate =
    eventType === 'assumida'
      ? task.assumed_at
      : eventType === 'cancelada'
        ? task.cancelled_at
        : eventType === 'pausada'
          ? task.paused_at
          : eventType === 'retomada'
            ? task.resumed_at
            : new Date().toISOString();

  const embed = new EmbedBuilder()
    .setTitle(settings.title)
    .setColor(settings.color)
    .addFields(
      {
        name: '🆔 Tarefa',
        value: `#${task.id} - ${truncateText(task.title, 900)}`,
        inline: false
      },
      {
        name: '🏢 Empresa',
        value: truncateText(task.company || 'Não informada', 1024),
        inline: true
      },
      {
        name: `👤 ${settings.actorLabel}`,
        value: `<@${interaction.user.id}> (${interaction.user.username})`,
        inline: true
      },
      {
        name: '🚨 Prioridade',
        value: getPriorityLabel(task.priority),
        inline: true
      },
      {
        name: '📅 Data e hora',
        value: formatDateBR(eventDate),
        inline: true
      },
      {
        name: '🔔 Avisos enviados',
        value: String(task.reminder_count || 0),
        inline: true
      }
    )
    .setTimestamp();

  if (eventType === 'cancelada' && task.assumed_at) {
    embed.addFields({
      name: '⏱️ Tempo até o cancelamento',
      value: formatDuration(task.assumed_at, task.cancelled_at),
      inline: true
    });
  }

  if (eventType === 'pausada') {
    embed.addFields(
      {
        name: '📝 Motivo da pausa',
        value: truncateText(task.pause_reason || 'Não informado', 1024),
        inline: false
      },
      {
        name: '🔢 Número da pausa',
        value: String(task.pause_count || 1),
        inline: true
      }
    );
  }

  if (eventType === 'retomada') {
    embed.addFields(
      {
        name: '⏸️ Duração desta pausa',
        value: formatDuration(task.paused_at, task.resumed_at),
        inline: true
      },
      {
        name: '⏱️ Tempo total pausado',
        value: formatSecondsDuration(task.total_paused_seconds),
        inline: true
      },
      {
        name: '📝 Último motivo',
        value: truncateText(task.pause_reason || 'Não informado', 1024),
        inline: false
      }
    );
  }

  await sendAuditLog(interaction.guild, { embeds: [embed] });
}

async function sendNewTaskLog(interaction, task) {
  if (!interaction.guildId || !interaction.guild) return;

  const { data: logSetting, error: logSettingError } = await supabase
    .from('log_settings')
    .select('log_channel_id')
    .eq('guild_id', interaction.guildId)
    .maybeSingle();

  if (logSettingError) {
    console.error('Erro ao buscar o canal de LOG da nova tarefa:', logSettingError);
    return;
  }

  if (!logSetting?.log_channel_id) {
    console.log(
      `ℹ️ Tarefa #${task.id} criada, mas não existe canal de LOG configurado neste servidor.`
    );
    return;
  }

  try {
    const channel = await interaction.guild.channels.fetch(
      logSetting.log_channel_id
    );

    if (!channel || !channel.isTextBased()) {
      console.error('O canal configurado para LOG não é um canal de texto válido.');
      return;
    }

    const creatorName =
      interaction.member?.displayName ||
      interaction.user.globalName ||
      interaction.user.username;
    const logo = getBotLogo();
    const priorityColors = {
      urgente: '#ED4245',
      media: '#FEE75C',
      baixa: '#57F287'
    };

    const newTaskEmbed = new EmbedBuilder()
      .setTitle('🆕 Nova Tarefa Criada!')
      .setColor(priorityColors[task.priority] || '#0099FF')
      .setDescription('Uma nova tarefa foi registrada na Central de Tarefas MH INFO.')
      .addFields(
        {
          name: '👤 Criada por',
          value: `<@${interaction.user.id}> (${truncateText(creatorName, 80)})`,
          inline: true
        },
        {
          name: '🏢 Empresa',
          value: truncateText(task.company || 'Não informada', 1024),
          inline: true
        },
        {
          name: '🆔 ID da Tarefa',
          value: `#${task.id}`,
          inline: true
        },
        {
          name: '📝 Título',
          value: truncateText(task.title || 'Sem título', 1024),
          inline: false
        },
        {
          name: '🛠️ Problema / Descrição',
          value: truncateText(task.description || 'Sem descrição adicional', 1024),
          inline: false
        },
        {
          name: '🚨 Urgência',
          value: getPriorityLabel(task.priority),
          inline: true
        },
        {
          name: '📅 Data e hora',
          value: formatDateBR(task.created_at || new Date().toISOString()),
          inline: true
        }
      )
      .setFooter({
        text: 'MH INFO • Registro automático de tarefas',
        iconURL: logo || undefined
      })
      .setTimestamp();

    if (logo) newTaskEmbed.setThumbnail(logo);

    await channel.send({
      content: `🆕 <@${interaction.user.id}> criou uma nova tarefa!`,
      embeds: [newTaskEmbed],
      allowedMentions: {
        users: [interaction.user.id]
      }
    });
  } catch (sendError) {
    console.error(
      `Não foi possível enviar o LOG da criação da tarefa #${task.id}:`,
      sendError.message
    );
  }
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
    .setDescription('Define o canal privado de auditoria e os cargos autorizados.')
    .addChannelOption(option =>
      option
        .setName('canal')
        .setDescription('Canal onde os logs serão enviados')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName('cargo_ceo')
        .setDescription('Cargo CEO autorizado a visualizar os logs')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName('cargo_adm')
        .setDescription('Cargo ADM autorizado a visualizar os logs')
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
      const reminderNumber = Number(task.reminder_count || 0) + 1;
      const taskStart = task.assumed_at || task.updated_at || task.created_at;

      const reminderEmbed = new EmbedBuilder()
        .setTitle(`⏰ Aviso nº ${reminderNumber} • Tarefa em Andamento`)
        .setColor('#FEE75C')
        .setDescription(
          `A tarefa **#${task.id} - ${task.title}** ainda não foi concluída ` +
          `e está em andamento ${getRelativeTime(taskStart)}.`
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
          },
          {
            name: '▶️ Início da tarefa',
            value: formatDateBR(taskStart),
            inline: true
          },
          {
            name: '⏱️ Tempo total em andamento',
            value: formatDuration(taskStart),
            inline: true
          },
          {
            name: '🔔 Número deste aviso',
            value: String(reminderNumber),
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
                `Este é o **aviso nº ${reminderNumber}** para dar continuidade e ` +
                'concluí-la assim que possível.',
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
              value: formatDuration(taskStart),
              inline: true
            },
            {
              name: '🔔 Número do aviso',
              value: String(reminderNumber),
              inline: true
            }
          )
          .setFooter({
            text: 'MH INFO • Central de Serviços'
          })
          .setTimestamp();

        await assignedUser.send({
          content:
            `🔔 Olá! Este é o aviso nº ${reminderNumber} sobre uma tarefa que você assumiu.`,
          embeds: [privateReminderEmbed]
        });
      } catch (directMessageError) {
        console.error(
          `Não foi possível enviar mensagem privada para o responsável da tarefa #${task.id}:`,
          directMessageError.message
        );
      }

      // Reinicia a contagem. Se continuar aberta, haverá um novo aviso após 1 hora.
      const reminderTime = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          reminder_count: reminderNumber,
          last_reminder_at: reminderTime,
          updated_at: reminderTime
        })
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
    .in('status', ['pendente', 'em_andamento', 'pausada'])
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
  const pausedCount = tasks.filter(task => task.status === 'pausada').length;
  const urgentCount = tasks.filter(task => task.priority === 'urgente').length;
  const logo = getBotLogo();

  const panelDescription =
    '**Tecnologia • Suporte • Infraestrutura**\n\n' +
    '## 🔵 TAREFAS EM ANDAMENTO\n' +
    `*${tasks.length} ${tasks.length === 1 ? 'chamado ativo' : 'chamados ativos'} no momento*\n\n` +
    `🔴 Urgentes: **${urgentCount}**  •  🟠 Pendentes: **${pendingCount}**  •  ` +
    `🔵 Em andamento: **${progressCount}**  •  ⏸️ Pausadas: **${pausedCount}**`;

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
        : task.status === 'pausada'
          ? '⏸️ **Pausada**'
          : '🟠 **Pendente**';

      const pauseInfo = task.status === 'pausada'
        ? `\n📝 Motivo da pausa: ${truncateText(task.pause_reason || 'Não informado', 120)}`
        : '';

      const description = task.description &&
        task.description !== 'Sem descrição adicional'
        ? `\n📄 ${truncateText(task.description, 180)}`
        : '';

      const fieldName = `🏢 ${company}  •  \`#${task.id}\``;
      const fieldValue = truncateText(
        `📝 **${truncateText(task.title || 'Tarefa sem título', 160)}**${description}\n\n` +
        `👤 Responsável: ${assigned}\n` +
        `🚨 Prioridade: ${getPriorityVisual(task.priority)}\n` +
        `⏱️ Status: ${status}${pauseInfo}\n` +
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
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_cancelar_tarefa')
      .setLabel('🚫 Cancelar')
      .setStyle(ButtonStyle.Danger)
  );

  const pauseRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_pausar_tarefa')
      .setLabel('⏸️ Pausar')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_retomar_tarefa')
      .setLabel('▶️ Retomar')
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row, pauseRow] };
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
        `▶️ **Início:** ${formatDateBR(task.assumed_at || task.created_at)}\n` +
        `📅 **Data de Conclusão:** ${formatDateBR(task.completed_at)}\n` +
        `⏱️ **Duração:** ${formatDuration(task.assumed_at || task.created_at, task.completed_at)}\n` +
        `⏸️ **Pausas:** ${task.pause_count || 0} (${formatSecondsDuration(task.total_paused_seconds)})\n` +
        `🔔 **Avisos:** ${task.reminder_count || 0}\n` +
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
    // Registra comandos, botões, menus e textos enviados nos formulários.
    void logInteractionAudit(interaction).catch(error => {
      console.error('Erro ao registrar a interação no LOG:', error.message);
    });

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
            status: 'pendente',
            created_by_id: interaction.user.id,
            created_by_name: interaction.user.username
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

        await sendNewTaskLog(interaction, task);
        return;
      }

      if (commandName === 'empresa') {
        await interaction.deferReply();
        const nomeEmpresa = interaction.options.getString('nome');

        const { data: companyTasks, error } = await supabase
          .from('tasks')
          .select('*')
          .ilike('company', `%${nomeEmpresa}%`)
          .in('status', ['pendente', 'em_andamento', 'pausada'])
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
              : task.status === 'pausada'
                ? '⏸️ [PAUSADA]'
                : '🔴 [PENDENTE]';
            const assigned = task.assigned_to_id
              ? `<@${task.assigned_to_id}>`
              : '*Ninguém*';
            const pauseReason = task.status === 'pausada'
              ? `Motivo da pausa: ${truncateText(task.pause_reason || 'Não informado', 250)}\n`
              : '';

            content +=
              `**#${task.id} - ${task.title}**\n` +
              `Status: ${status} | Prioridade: ${getPriorityLabel(task.priority)}\n` +
              `Responsável: ${assigned}\n` +
              pauseReason +
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

        await sendTaskLifecycleLog(interaction, data[0], 'excluida');
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
        const ceoRole = interaction.options.getRole('cargo_ceo');
        const admRole = interaction.options.getRole('cargo_adm');

        if (!channel.permissionOverwrites) {
          await interaction.editReply(
            '❌ Selecione um canal de texto comum que permita configurar permissões.'
          );
          return;
        }

        try {
          await channel.permissionOverwrites.set(
            [
              {
                id: interaction.guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
              },
              {
                id: ceoRole.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory
                ]
              },
              {
                id: admRole.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory
                ]
              },
              {
                id: client.user.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory,
                  PermissionFlagsBits.EmbedLinks,
                  PermissionFlagsBits.AttachFiles
                ]
              }
            ],
            'Canal privado de auditoria: acesso para CEO, ADM e o bot.'
          );
        } catch (permissionError) {
          console.error('Erro ao proteger o canal de LOG:', permissionError);
          await interaction.editReply(
            '❌ Não consegui proteger o canal. Dê ao bot a permissão **Gerenciar canais** e tente novamente.'
          );
          return;
        }

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

        logChannelCache.set(interaction.guildId, channel.id);

        await interaction.editReply(
          `✅ Canal de auditoria definido para ${channel}. Somente ${ceoRole}, ` +
          `${admRole}, administradores do servidor e o bot poderão visualizá-lo.`
        );

        const configEmbed = new EmbedBuilder()
          .setTitle('🔐 Canal de Auditoria Configurado')
          .setColor('#57F287')
          .addFields(
            {
              name: '👤 Configurado por',
              value: `<@${interaction.user.id}> (${interaction.user.username})`,
              inline: false
            },
            {
              name: '👑 Cargo CEO',
              value: `${ceoRole}`,
              inline: true
            },
            {
              name: '🛡️ Cargo ADM',
              value: `${admRole}`,
              inline: true
            }
          )
          .setTimestamp();

        await sendAuditLog(interaction.guild, { embeds: [configEmbed] });
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

      if (customId === 'btn_pausar_tarefa') {
        await interaction.deferReply({ flags: 64 });

        const { data: tasks, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('status', 'em_andamento')
          .eq('assigned_to_id', interaction.user.id)
          .order('id', { ascending: false })
          .limit(25);

        if (error) {
          console.error('Erro ao buscar tarefas para pausar:', error);
          await interaction.editReply(
            `❌ Erro ao buscar tarefas: \`${error.message}\``
          );
          return;
        }

        if (!tasks || tasks.length === 0) {
          await interaction.editReply(
            '❌ Você não possui nenhuma tarefa em andamento para pausar.'
          );
          return;
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('select_pausar_tarefa')
          .setPlaceholder('Selecione a tarefa que deseja pausar...')
          .addOptions(tasks.map(task => ({
            label: `#${task.id} - ${task.title}`.slice(0, 100),
            description: `Empresa: ${task.company}`.slice(0, 100),
            value: String(task.id)
          })));

        await interaction.editReply({
          content: '⏸️ Escolha a tarefa que deseja pausar:',
          components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
      }

      if (customId === 'btn_retomar_tarefa') {
        await interaction.deferReply({ flags: 64 });

        const { data: tasks, error } = await supabase
          .from('tasks')
          .select('*')
          .eq('status', 'pausada')
          .eq('assigned_to_id', interaction.user.id)
          .order('id', { ascending: false })
          .limit(25);

        if (error) {
          console.error('Erro ao buscar tarefas pausadas:', error);
          await interaction.editReply(
            `❌ Erro ao buscar tarefas: \`${error.message}\``
          );
          return;
        }

        if (!tasks || tasks.length === 0) {
          await interaction.editReply(
            '❌ Você não possui nenhuma tarefa pausada para retomar.'
          );
          return;
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('select_retomar_tarefa')
          .setPlaceholder('Selecione a tarefa que deseja retomar...')
          .addOptions(tasks.map(task => ({
            label: `#${task.id} - ${task.title}`.slice(0, 100),
            description:
              `Motivo: ${task.pause_reason || 'Não informado'}`.slice(0, 100),
            value: String(task.id)
          })));

        await interaction.editReply({
          content: '▶️ Escolha a tarefa que deseja retomar:',
          components: [new ActionRowBuilder().addComponents(selectMenu)]
        });
        return;
      }

      if (customId === 'btn_cancelar_tarefa') {
        await interaction.deferReply({ flags: 64 });

        const { data: tasks, error } = await supabase
          .from('tasks')
          .select('*')
          .in('status', ['pendente', 'em_andamento', 'pausada'])
          .order('id', { ascending: false })
          .limit(25);

        if (error) {
          console.error('Erro ao buscar tarefas para cancelar:', error);
          await interaction.editReply(
            `❌ Erro ao buscar tarefas: \`${error.message}\``
          );
          return;
        }

        if (!tasks || tasks.length === 0) {
          await interaction.editReply('❌ Não há tarefas abertas para cancelar.');
          return;
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('select_cancelar_tarefa')
          .setPlaceholder('Selecione uma tarefa para cancelar...')
          .addOptions(tasks.map(task => ({
            label: `#${task.id} - ${task.title}`.slice(0, 100),
            description: `Empresa: ${task.company}`.slice(0, 100),
            value: String(task.id)
          })));

        await interaction.editReply({
          content: '🚫 Escolha a tarefa que deseja cancelar:',
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
      if (interaction.customId === 'select_pausar_tarefa') {
        const taskId = interaction.values[0];
        const modal = new ModalBuilder()
          .setCustomId(`modal_pausar_tarefa_${taskId}`)
          .setTitle('⏸️ Pausar Tarefa');

        const inputMotivo = new TextInputBuilder()
          .setCustomId('input_motivo_pausa')
          .setLabel('Motivo da pausa')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Ex: aguardando retorno do cliente ou chegada de uma peça')
          .setRequired(true)
          .setMaxLength(1000);

        modal.addComponents(
          new ActionRowBuilder().addComponents(inputMotivo)
        );

        await interaction.showModal(modal);
        return;
      }

      if (interaction.customId === 'select_retomar_tarefa') {
        await interaction.deferUpdate();
        const taskId = interaction.values[0];

        const { data: currentTask, error: fetchError } = await supabase
          .from('tasks')
          .select('*')
          .eq('id', taskId)
          .eq('status', 'pausada')
          .eq('assigned_to_id', interaction.user.id)
          .maybeSingle();

        if (fetchError || !currentTask) {
          await interaction.editReply({
            content:
              `❌ Não foi possível retomar a tarefa: \`${fetchError?.message || 'ela não está pausada ou não pertence a você'}\``,
            components: []
          });
          return;
        }

        const resumedAt = new Date().toISOString();
        const currentPauseSeconds = currentTask.paused_at
          ? Math.max(
              0,
              Math.floor(
                (new Date(resumedAt).getTime() - new Date(currentTask.paused_at).getTime()) /
                1000
              )
            )
          : 0;
        const totalPausedSeconds =
          Number(currentTask.total_paused_seconds || 0) + currentPauseSeconds;

        const { data, error } = await supabase
          .from('tasks')
          .update({
            status: 'em_andamento',
            resumed_at: resumedAt,
            total_paused_seconds: totalPausedSeconds,
            updated_at: resumedAt
          })
          .eq('id', taskId)
          .eq('status', 'pausada')
          .eq('assigned_to_id', interaction.user.id)
          .select();

        if (error || !data || data.length === 0) {
          await interaction.editReply({
            content:
              `❌ Erro ao retomar tarefa: \`${error?.message || 'a tarefa já foi alterada'}\``,
            components: []
          });
          return;
        }

        const task = data[0];

        await interaction.editReply({
          content:
            `▶️ A tarefa **#${task.id} - ${task.title}** foi retomada. ` +
            'O prazo do próximo lembrete começou novamente agora.',
          components: []
        });

        await sendTaskLifecycleLog(interaction, task, 'retomada');
        return;
      }

      if (interaction.customId === 'select_assumir_tarefa') {
        await interaction.deferUpdate();
        const taskId = interaction.values[0];
        const assumedAt = new Date().toISOString();

        const { data, error } = await supabase
          .from('tasks')
          .update({
            status: 'em_andamento',
            assigned_to_id: interaction.user.id,
            assigned_to_name: interaction.user.username,
            assumed_at: assumedAt,
            reminder_count: 0,
            last_reminder_at: null,
            updated_at: assumedAt
          })
          .eq('id', taskId)
          .in('status', ['pendente', 'em_andamento'])
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

        await sendTaskLifecycleLog(interaction, data[0], 'assumida');
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
          .in('status', ['pendente', 'em_andamento'])
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
        const completionPausedSeconds = Number(task.total_paused_seconds || 0);
        const completionElapsedSeconds = Math.max(
          0,
          Math.floor(
            (new Date(now).getTime() -
              new Date(task.assumed_at || task.created_at).getTime()) /
              1000
          )
        );
        const effectiveWorkSeconds = Math.max(
          0,
          completionElapsedSeconds - completionPausedSeconds
        );

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
                    name: '▶️ Início',
                    value: formatDateBR(task.assumed_at || task.created_at),
                    inline: true
                  },
                  {
                    name: '✅ Conclusão',
                    value: formatDateBR(now),
                    inline: true
                  },
                  {
                    name: '⏱️ Tempo para concluir',
                    value: formatDuration(task.assumed_at || task.created_at, now),
                    inline: true
                  },
                  {
                    name: '🔔 Avisos necessários',
                    value: String(task.reminder_count || 0),
                    inline: true
                  },
                  {
                    name: '⏸️ Quantidade de pausas',
                    value: String(task.pause_count || 0),
                    inline: true
                  },
                  {
                    name: '⏱️ Tempo total pausado',
                    value: formatSecondsDuration(completionPausedSeconds),
                    inline: true
                  },
                  {
                    name: '🛠️ Tempo efetivo de trabalho',
                    value: formatSecondsDuration(effectiveWorkSeconds),
                    inline: true
                  }
                )
                .setTimestamp();

              if (task.last_reminder_at) {
                logEmbed.addFields({
                  name: '🔔 Último aviso enviado',
                  value: formatDateBR(task.last_reminder_at),
                  inline: true
                });
              }

              if (logo) logEmbed.setThumbnail(logo);
              await channel.send({ embeds: [logEmbed] });
            }
          } catch (sendError) {
            console.error('Não foi possível enviar o log:', sendError);
          }
        }

        return;
      }

      if (interaction.customId === 'select_cancelar_tarefa') {
        await interaction.deferUpdate();
        const taskId = interaction.values[0];
        const cancelledAt = new Date().toISOString();

        const { data, error } = await supabase
          .from('tasks')
          .update({
            status: 'cancelada',
            cancelled_by_id: interaction.user.id,
            cancelled_by_name: interaction.user.username,
            cancelled_at: cancelledAt,
            updated_at: cancelledAt
          })
          .eq('id', taskId)
          .in('status', ['pendente', 'em_andamento', 'pausada'])
          .select();

        if (error || !data || data.length === 0) {
          await interaction.editReply({
            content:
              `❌ Erro ao cancelar tarefa: \`${error?.message || 'Tarefa não encontrada ou já finalizada'}\``,
            components: []
          });
          return;
        }

        const task = data[0];

        await interaction.editReply({
          content:
            `🚫 A tarefa **#${task.id} - ${task.title}** da empresa ` +
            `**${task.company}** foi cancelada.`,
          components: []
        });

        await sendTaskLifecycleLog(interaction, task, 'cancelada');
        return;
      }
    }

    // -------------------------------------------------------------------------
    // MODAIS
    // -------------------------------------------------------------------------

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith('modal_pausar_tarefa_')
    ) {
      await interaction.deferReply({ flags: 64 });

      const taskId = interaction.customId.replace('modal_pausar_tarefa_', '');
      const pauseReason = interaction.fields
        .getTextInputValue('input_motivo_pausa')
        .trim();

      const { data: currentTask, error: fetchError } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .eq('status', 'em_andamento')
        .eq('assigned_to_id', interaction.user.id)
        .maybeSingle();

      if (fetchError || !currentTask) {
        await interaction.editReply(
          `❌ Não foi possível pausar a tarefa: \`${fetchError?.message || 'ela não está em andamento ou não pertence a você'}\``
        );
        return;
      }

      const pausedAt = new Date().toISOString();
      const pauseCount = Number(currentTask.pause_count || 0) + 1;

      const { data, error } = await supabase
        .from('tasks')
        .update({
          status: 'pausada',
          paused_at: pausedAt,
          paused_by_id: interaction.user.id,
          paused_by_name: interaction.user.username,
          pause_reason: pauseReason,
          pause_count: pauseCount,
          updated_at: pausedAt
        })
        .eq('id', taskId)
        .eq('status', 'em_andamento')
        .eq('assigned_to_id', interaction.user.id)
        .select();

      if (error || !data || data.length === 0) {
        await interaction.editReply(
          `❌ Erro ao pausar tarefa: \`${error?.message || 'a tarefa já foi alterada'}\``
        );
        return;
      }

      const task = data[0];

      await interaction.editReply(
        `⏸️ A tarefa **#${task.id} - ${task.title}** foi pausada. ` +
        'Os lembretes ficam suspensos até você retomá-la.'
      );

      await sendTaskLifecycleLog(interaction, task, 'pausada');
      return;
    }

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
          status: 'pendente',
          created_by_id: interaction.user.id,
          created_by_name: interaction.user.username
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

      await sendNewTaskLog(interaction, task);
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
// AUDITORIA DE MENSAGENS DO SERVIDOR
// -----------------------------------------------------------------------------

client.on(Events.MessageCreate, async message => {
  try {
    if (!message.guild || message.author?.bot) return;

    const logChannel = await getConfiguredLogChannel(message.guild);
    if (!logChannel || message.channelId === logChannel.id) return;

    const attachments = message.attachments
      .map(attachment => `[${attachment.name || 'arquivo'}](${attachment.url})`)
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('💬 Mensagem Enviada')
      .setColor('#5865F2')
      .addFields(
        {
          name: '👤 Autor',
          value: `<@${message.author.id}> (${message.author.username})`,
          inline: true
        },
        {
          name: '📍 Canal',
          value: `<#${message.channelId}>`,
          inline: true
        },
        {
          name: '🆔 ID da mensagem',
          value: message.id,
          inline: true
        },
        {
          name: '📝 Conteúdo',
          value: truncateText(message.content || '*Mensagem sem texto*', 1024),
          inline: false
        }
      )
      .setTimestamp();

    if (attachments) {
      embed.addFields({
        name: '📎 Anexos',
        value: truncateText(attachments, 1024),
        inline: false
      });
    }

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Erro ao registrar mensagem enviada:', error.message);
  }
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  try {
    if (newMessage.partial) {
      try {
        await newMessage.fetch();
      } catch {
        // O conteúdo posterior poderá continuar indisponível.
      }
    }

    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const logChannel = await getConfiguredLogChannel(newMessage.guild);
    if (!logChannel || newMessage.channelId === logChannel.id) return;

    const embed = new EmbedBuilder()
      .setTitle('✏️ Mensagem Editada')
      .setColor('#FEE75C')
      .addFields(
        {
          name: '👤 Autor',
          value: newMessage.author
            ? `<@${newMessage.author.id}> (${newMessage.author.username})`
            : 'Autor não disponível',
          inline: true
        },
        {
          name: '📍 Canal',
          value: `<#${newMessage.channelId}>`,
          inline: true
        },
        {
          name: '🆔 ID da mensagem',
          value: newMessage.id,
          inline: true
        },
        {
          name: '📄 Antes',
          value: truncateText(oldMessage.content || '*Conteúdo anterior indisponível*', 1024),
          inline: false
        },
        {
          name: '📝 Depois',
          value: truncateText(newMessage.content || '*Mensagem sem texto*', 1024),
          inline: false
        }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Erro ao registrar mensagem editada:', error.message);
  }
});

client.on(Events.MessageDelete, async message => {
  try {
    if (!message.guild || message.author?.bot) return;

    const logChannel = await getConfiguredLogChannel(message.guild);
    if (!logChannel || message.channelId === logChannel.id) return;

    const attachments = message.attachments
      ?.map(attachment => attachment.url)
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Mensagem Apagada')
      .setColor('#ED4245')
      .addFields(
        {
          name: '👤 Autor',
          value: message.author
            ? `<@${message.author.id}> (${message.author.username})`
            : 'Autor não disponível',
          inline: true
        },
        {
          name: '📍 Canal',
          value: `<#${message.channelId}>`,
          inline: true
        },
        {
          name: '🆔 ID da mensagem',
          value: message.id,
          inline: true
        },
        {
          name: '📝 Conteúdo apagado',
          value: truncateText(
            message.content || '*Conteúdo indisponível: a mensagem não estava no cache do bot.*',
            1024
          ),
          inline: false
        }
      )
      .setTimestamp();

    if (attachments) {
      embed.addFields({
        name: '📎 Anexos apagados',
        value: truncateText(attachments, 1024),
        inline: false
      });
    }

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Erro ao registrar mensagem apagada:', error.message);
  }
});

client.on(Events.MessageBulkDelete, async messages => {
  try {
    const firstMessage = messages.first();
    if (!firstMessage?.guild) return;

    const logChannel = await getConfiguredLogChannel(firstMessage.guild);
    if (!logChannel || firstMessage.channelId === logChannel.id) return;

    const summary = messages
      .first(20)
      .map(message => {
        const author = message.author
          ? `${message.author.username} (${message.author.id})`
          : 'Autor desconhecido';
        const content = truncateText(message.content || 'Conteúdo indisponível', 120);
        return `• **${author}:** ${content}`;
      })
      .join('\n');

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Mensagens Apagadas em Massa')
      .setColor('#992D22')
      .setDescription(truncateText(summary || 'Sem conteúdo disponível.', 4096))
      .addFields(
        {
          name: '📍 Canal',
          value: `<#${firstMessage.channelId}>`,
          inline: true
        },
        {
          name: '🔢 Quantidade',
          value: String(messages.size),
          inline: true
        }
      )
      .setTimestamp();

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Erro ao registrar exclusão em massa:', error.message);
  }
});

// -----------------------------------------------------------------------------
// LOGIN DO BOT
// -----------------------------------------------------------------------------

client.login(DISCORD_TOKEN);
