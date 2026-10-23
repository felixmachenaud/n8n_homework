import { workflow, node, trigger, ifElse, languageModel, outputParser, newCredential, expr } from '@n8n/workflow-sdk';

const sheetCredential = newCredential('Google Sheets account');
const geminiCredential = newCredential('Google Gemini(PaLM) Api account', 'T4J2HBmlQXghtaBj');

const crmStatusChanged = trigger({
  type: 'n8n-nodes-base.googleSheetsTrigger',
  version: 1,
  config: {
    name: 'CRM status changed',
    parameters: {
      pollTimes: { item: [{ mode: 'everyMinute' }] },
      authentication: 'triggerOAuth2',
      documentId: {
        __rl: true,
        mode: 'id',
        value: '1m5NSrZH8qbb4ANN_kf6XONWFnPiF8kuvOn-_M1WaBQE',
        cachedResultName: 'CRM WebSite Studio',
      },
      sheetName: {
        __rl: true,
        mode: 'name',
        value: 'CRM',
        cachedResultName: 'CRM',
      },
      event: 'rowUpdate',
      includeInOutput: 'new',
      options: {
        columnsToWatch: ['état'],
      },
    },
    credentials: {
      googleSheetsTriggerOAuth2Api: sheetCredential,
    },
  },
});

const eligibleProspect = ifElse({
  version: 2.2,
  config: {
    name: 'Eligible prospect?',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
        combinator: 'and',
        conditions: [
          {
            id: 'has-mail',
            leftValue: expr('{{ $(\'CRM status changed\').item.json.mail }}'),
            operator: { type: 'string', operation: 'notEmpty' },
            rightValue: '',
          },
          {
            id: 'has-note',
            leftValue: expr('{{ $(\'CRM status changed\').item.json.note }}'),
            operator: { type: 'string', operation: 'notEmpty' },
            rightValue: '',
          },
          {
            id: 'has-status',
            leftValue: expr('{{ $(\'CRM status changed\').item.json.état }}'),
            operator: { type: 'string', operation: 'notEmpty' },
            rightValue: '',
          },
          {
            id: 'not-issue',
            leftValue: expr('{{ $(\'CRM status changed\').item.json.état }}'),
            operator: { type: 'string', operation: 'notEquals' },
            rightValue: 'Issue ?',
          },
        ],
      },
    },
  },
});

const geminiChatModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  version: 1.2,
  config: {
    name: 'Gemini Chat Model',
    parameters: {
      modelName: 'models/gemini-3-flash-preview',
      options: { temperature: 0.5, maxOutputTokens: 2048 },
    },
    credentials: { googlePalmApi: geminiCredential },
  },
});

const geminiFixModel = languageModel({
  type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  version: 1.2,
  config: {
    name: 'Gemini Fix Model',
    parameters: {
      modelName: 'models/gemini-3-flash-preview',
      options: { temperature: 0.2, maxOutputTokens: 2048 },
    },
    credentials: { googlePalmApi: geminiCredential },
  },
});

const emailOutputParser = outputParser({
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  version: 1.3,
  config: {
    name: 'Email output parser',
    parameters: {
      schemaType: 'fromJson',
      jsonSchemaExample:
        '{ "subject": "Suite à notre échange", "body": "Cher Monsieur,\\n\\nJe pensais à vous...\\n\\nBien à vous,\\nFélix Machenaud" }',
      autoFix: true,
    },
    subnodes: { model: geminiFixModel },
  },
});

const draftCrmEmail = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: {
    name: 'Draft CRM email',
    parameters: {
      promptType: 'define',
      hasOutputParser: true,
      text: expr(
        '{{ JSON.stringify({ prospect: $(\'CRM status changed\').item.json[\'chaud ou dmd de mail\'], email: $(\'CRM status changed\').item.json.mail, contactName: $(\'CRM status changed\').item.json[\'Colonne 3\'], phone: $(\'CRM status changed\').item.json[\'Colonne 2\'], status: $(\'CRM status changed\').item.json.état, note: $(\'CRM status changed\').item.json.note }) }}',
      ),
      messages: {
        messageValues: [
          {
            type: 'SystemMessagePromptTemplate',
            message:
              'Tu rédiges des e-mails de relance CRM pour Félix Machenaud (WebSite Studio). Style: français, vouvoiement, ton chaleureux et professionnel, concis (120-220 mots). Objectif: rester en contact, pas vendre sauf si la note le demande explicitement. Accroche personnalisée à partir de la note (ex. "Je pensais à vous en...", "J\'ai repensé à notre échange sur..."). Ne invente pas de faits absents de la note. Pas de prix ni d\'offre commerciale sauf mention explicite dans la note. Formule de politesse: "Bien à vous," puis ligne "Félix Machenaud". Exemples de ton: messages courts de suivi après échange, pas de catalogue de services. Retourne subject (objet court, naturel) et body (corps complet avec sauts de ligne).',
          },
        ],
      },
    },
    subnodes: { model: geminiChatModel, outputParser: emailOutputParser },
  },
});

const writeDraftToSheet = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Write draft to sheet',
    parameters: {
      resource: 'sheet',
      operation: 'update',
      authentication: 'oAuth2',
      documentId: {
        __rl: true,
        mode: 'id',
        value: '1m5NSrZH8qbb4ANN_kf6XONWFnPiF8kuvOn-_M1WaBQE',
        cachedResultName: 'CRM WebSite Studio',
      },
      sheetName: {
        __rl: true,
        mode: 'name',
        value: 'CRM',
        cachedResultName: 'CRM',
      },
      columns: {
        mappingMode: 'defineBelow',
        matchingColumns: ['mail'],
        value: {
          mail: expr('{{ $(\'CRM status changed\').item.json.mail }}'),
          'Objet mail': expr('{{ $(\'Draft CRM email\').item.json.output.subject }}'),
          'Brouillon mail': expr('{{ $(\'Draft CRM email\').item.json.output.body }}'),
        },
        schema: [
          {
            id: 'mail',
            displayName: 'mail',
            required: false,
            defaultMatch: true,
            display: true,
            type: 'string',
            canBeUsedToMatch: true,
          },
          {
            id: 'Objet mail',
            displayName: 'Objet mail',
            required: false,
            defaultMatch: false,
            display: true,
            type: 'string',
            canBeUsedToMatch: false,
          },
          {
            id: 'Brouillon mail',
            displayName: 'Brouillon mail',
            required: false,
            defaultMatch: false,
            display: true,
            type: 'string',
            canBeUsedToMatch: false,
          },
        ],
      },
      options: {
        cellFormat: 'USER_ENTERED',
        handlingExtraData: 'insertInNewColumn',
      },
    },
    credentials: { googleSheetsOAuth2Api: sheetCredential },
  },
});

export default workflow('crm-draft-on-status', 'My workflow 3')
  .add(crmStatusChanged)
  .to(eligibleProspect.onTrue(draftCrmEmail.to(writeDraftToSheet)));
