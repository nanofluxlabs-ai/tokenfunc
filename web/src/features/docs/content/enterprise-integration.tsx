import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'
import { useStatus } from '@/hooks/use-status'

import { BaseUrlCard } from '../components/base-url-card'
import { DocSteps, Note, P } from '../components/doc-prose'
import { DocSection } from '../components/doc-section'
import { EndpointHeader } from '../components/endpoint-header'
import { ParamTable } from '../components/param-table'
import { useDocsBaseUrl } from '../hooks/use-docs-base-url'

/** 企业接入相关错误码；status 是真实 HTTP 状态码，错误体为 OpenAI error 格式 */
const ERROR_ROWS = [
  {
    name: 'insufficient_user_quota',
    type: '403',
    descriptionKey:
      'The enterprise balance or credit limit is used up, or the enterprise account is suspended. Top up / wait for the next period, or contact your account manager.',
  },
  {
    name: 'team_budget_exceeded',
    type: '403',
    descriptionKey:
      'The team that owns this key has reached its monthly budget and the budget is set to block. Requests resume next month or after the admin raises the budget.',
  },
  {
    name: 'credit_period_awaiting_payment',
    type: '403',
    descriptionKey:
      'Quota-based credit is used up and the bill is awaiting payment. Service resumes when the bill is settled or the admin opens a new period.',
  },
  {
    name: 'enterprise_credit_not_enabled',
    type: '403',
    descriptionKey:
      'The credit endpoint was called by a prepaid enterprise or a personal account. Only credit-mode enterprises have period data.',
  },
  {
    name: 'credit_period_not_found',
    type: '404',
    descriptionKey:
      'No open credit period right now (the previous one is closing and the next one has not started). Retry shortly.',
  },
  {
    name: 'access_denied',
    type: '403',
    descriptionKey:
      'The key is not allowed to call this endpoint: credit queries need a team key without holder, and the employee self-check needs a key issued to an active member of an active team.',
  },
]

const EMPLOYEE_ME_FIELDS = [
  {
    name: 'enterprise',
    type: 'object',
    descriptionKey: 'Enterprise name and billing mode (prepaid / credit).',
  },
  {
    name: 'team',
    type: 'object',
    descriptionKey:
      'Team name and budget_state (none / ok / warn / exceeded) when a monthly budget is set.',
  },
  {
    name: 'member',
    type: 'object | null',
    descriptionKey:
      'Holder name and employee number; null for a team key without holder.',
  },
  {
    name: 'key',
    type: 'object',
    descriptionKey:
      'Key name, unlimited_quota, remain_quota, used_quota, expired_time and quota_policy (periodic reset, null when not set).',
  },
  {
    name: 'usage',
    type: 'object',
    descriptionKey: 'Quota consumed today and this month by this key.',
  },
  {
    name: 'top_models',
    type: 'array',
    descriptionKey: 'Up to five models this key used most this month.',
  },
  {
    name: 'models',
    type: 'string[]',
    descriptionKey: 'Models this key may call.',
  },
]

const CREDIT_SAMPLE = {
  object: 'billing_credit',
  billing_mode: 'credit',
  credit_cycle_type: 'natural_month',
  period_no: 3,
  period_start: 1759276800,
  period_end: 1761955200,
  limit_quota: 500000000,
  used_quota: 12345,
  available_quota: 499987655,
  limit: 1000,
  used: 0.02469,
  available: 999.97531,
  quota_display_type: 'USD',
  currency: 'USD',
}

const EMPLOYEE_ME_SAMPLE = {
  object: 'enterprise_employee',
  enterprise: { name: 'Acme', billing_mode: 'credit' },
  team: { name: 'Research', budget_state: 'ok' },
  member: { name: 'Alice', employee_no: 'E001' },
  key: {
    name: 'alice-dev',
    unlimited_quota: false,
    remain_quota: 2500000,
    used_quota: 500000,
    expired_time: -1,
    quota_policy: { reset_period: 'daily', period_quota: 3000000 },
  },
  usage: { today: 120000, month: 500000 },
  top_models: [{ model: 'gpt-4o', quota: 480000 }],
  models: ['gpt-4o', 'claude-sonnet-5'],
}

const AFFINITY_RULE_SAMPLE = {
  key_sources: [{ type: 'request_header', key: 'X-User-Id' }],
}

function shellSample(baseUrl: string, path: string): string {
  return `curl ${baseUrl}${path} \\\n  -H "Authorization: Bearer $TOKENFUNC_API_KEY"`
}

export default function EnterpriseIntegrationPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()
  const { status } = useStatus()
  const systemName =
    typeof status?.system_name === 'string' ? status.system_name : 'tokenfunc'
  const salesQrcode =
    typeof status?.sales_qrcode === 'string' ? status.sales_qrcode : ''

  return (
    <div>
      <P>
        {t(
          'This guide is for the technical owner of an enterprise account: how keys are organised, how to hand them to colleagues, how to read remaining credit from code, and what happens when a bill is due.'
        )}
      </P>

      <BaseUrlCard />

      <DocSection id='overview' title={t('Teams, members and keys')}>
        <P>
          {t(
            'An enterprise is one billing subject with three layers underneath. Teams are flat workspaces (every enterprise has a Default team). Members belong to one team each; a member either only holds keys, or also signs in to the console as developer, team admin or enterprise admin. Keys belong to a team and optionally to a member as holder.'
          )}
        </P>
        <CodeBlock
          code={[
            `${t('Enterprise')} (${t('one wallet / credit line')})`,
            ` └ ${t('Team')} (${t('= OpenAI project / Anthropic workspace')}; ${t('monthly budget')})`,
            `     ├ ${t('Member')} (${t('key only')} | developer | team_admin | enterprise_admin)`,
            `     └ ${t('API key')} (${t('team')} + ${t('optional holder')}; ${t('quota, periodic reset, model & IP allowlists')})`,
          ].join('\n')}
          language='text'
          enableCollapse={false}
          className='my-0'
        />
        <P>
          {t(
            'Billing never changes: every key is charged to the enterprise account. Teams and members are how usage is attributed, so a member moving to another team changes where new usage lands, never the history.'
          )}
        </P>
        <P>
          <Link
            to='/enterprise/overview'
            className='text-foreground underline underline-offset-4'
          >
            {t('Enterprise console')}
          </Link>
          {' — '}
          {t(
            'overview, teams, API keys, usage report and bills. Team admins and developers see only their own team.'
          )}
        </P>
      </DocSection>

      <DocSection id='employee-keys' title={t('Issuing keys to employees')}>
        <DocSteps
          items={[
            {
              title: t('Create the member and issue a key'),
              children: (
                <P>
                  {t(
                    'In the console under Teams, add the member (or import a CSV with name, email, employee_no and team), then use "Issue API Key" on the member row. The key is created under the team with the member as holder, and the plaintext is shown once together with a handover text you can paste to the employee.'
                  )}
                </P>
              ),
            },
            {
              title: t('Limit what the key can do'),
              children: (
                <P>
                  {t(
                    'Each key can carry a fixed quota or a periodic quota (daily / weekly / monthly / custom, automatically restored at the boundary), a model allowlist, an IP or CIDR whitelist and an expiry. Disabling the member disables all of their keys; archiving a team stops all of its keys.'
                  )}
                </P>
              ),
            },
            {
              title: t('Set a team budget if you want a hard stop'),
              children: (
                <P>
                  {t(
                    'A team can have a monthly budget with an alert threshold. By default reaching the budget only notifies the enterprise admins; enable "Block requests over budget" to reject the team\'s requests for the rest of the month with team_budget_exceeded.'
                  )}
                </P>
              ),
            },
          ]}
        />
        <Note>
          {t(
            'Keys issued to a member are for that person. Keys without holder are "team keys" for shared services, and they are the only keys allowed to query enterprise credit below.'
          )}
        </Note>
      </DocSection>

      <DocSection id='credit-api' title={t('Querying credit from code')}>
        <P>
          {t(
            'Credit-mode enterprises can read the current period from any team key. The three endpoints accept the same Bearer key as model requests and work with or without the /v1 prefix.'
          )}
        </P>
        <div className='flex flex-col gap-2'>
          <EndpointHeader
            method='GET'
            path='/v1/dashboard/billing/credit'
            description={t('Structured credit information (recommended)')}
          />
          <EndpointHeader
            method='GET'
            path='/v1/dashboard/billing/subscription'
            description={t(
              'OpenAI-compatible: hard_limit_usd = period limit, access_until = period end'
            )}
          />
          <EndpointHeader
            method='GET'
            path='/v1/dashboard/billing/usage'
            description={t(
              'OpenAI-compatible: total_usage = period usage × 100; dates are ignored'
            )}
          />
        </div>
        <CodeBlock
          code={shellSample(baseUrl, '/v1/dashboard/billing/credit')}
          language='bash'
          enableCollapse={false}
          className='my-4'
        >
          <CodeBlockCopyButton />
        </CodeBlock>
        <CodeBlock
          code={JSON.stringify(CREDIT_SAMPLE, null, 2)}
          language='json'
          enableCollapse={false}
          className='my-0'
        />
        <P>
          {t(
            'The *_quota fields are internal units; limit / used / available are converted to the display unit named by quota_display_type. For quota-based credit (no fixed end date) period_end is 0. available_quota never goes below 0 even when late settlements push used_quota over the limit.'
          )}
        </P>
        <Note>
          {t(
            'Keys issued to a member get 403 access_denied here — give integrations a team key. Prepaid enterprises get 403 enterprise_credit_not_enabled; between two periods the credit endpoint returns 404 credit_period_not_found.'
          )}
        </Note>
      </DocSection>

      <DocSection id='employee-me' title={t('Employee self-check')}>
        <P>
          {t(
            'Employees do not sign in. With their own key they can still see what the key is allowed to do and how much it has used.'
          )}
        </P>
        <EndpointHeader
          method='GET'
          path='/v1/enterprise/employee/me'
          description={t('Authorization: Bearer <employee key>')}
        />
        <CodeBlock
          code={shellSample(baseUrl, '/v1/enterprise/employee/me')}
          language='bash'
          enableCollapse={false}
          className='my-4'
        >
          <CodeBlockCopyButton />
        </CodeBlock>
        <ParamTable params={EMPLOYEE_ME_FIELDS} />
        <CodeBlock
          code={JSON.stringify(EMPLOYEE_ME_SAMPLE, null, 2)}
          language='json'
          enableCollapse={false}
          className='my-4'
        />
        <Note>
          {t(
            'Only key-level data is returned, never the enterprise balance. A key without holder, a disabled member or an archived team gets 403 access_denied; a suspended enterprise gets 403 insufficient_user_quota.'
          )}
        </Note>
      </DocSection>

      <DocSection id='end-user-header' title={t('Identifying your end users')}>
        <P>
          {t(
            'If your application serves many end users through one key, send a stable identifier per end user in a request header such as X-User-Id. The gateway can use it for channel affinity: the same user keeps hitting the same upstream channel, which improves prompt-cache hits and session continuity.'
          )}
        </P>
        <P>
          {t(
            'Ask your account manager to enable the rule on the platform side; it is a channel affinity key source of type request_header:'
          )}
        </P>
        <CodeBlock
          code={JSON.stringify(AFFINITY_RULE_SAMPLE, null, 2)}
          language='json'
          enableCollapse={false}
          className='my-0'
        />
        <Note>
          {t(
            'Use a value that is stable for the user (an internal user id or a hash of it). Session ids or timestamps defeat the purpose.'
          )}
        </Note>
      </DocSection>

      <DocSection id='errors' title={t('Enterprise error codes')}>
        <P>
          {t(
            'All errors use the OpenAI error envelope with the real HTTP status. These codes are specific to enterprise accounts; the generic ones are on the Errors page.'
          )}
        </P>
        <ParamTable params={ERROR_ROWS} />
        <Note>
          {t(
            '403 with a quota or budget code is not retryable: wait for the next period / month or contact the administrator. 404 credit_period_not_found and 5xx are safe to retry with backoff.'
          )}
        </Note>
      </DocSection>

      <DocSection id='billing' title={t('Billing cycle')}>
        <DocSteps
          items={[
            {
              title: t('Period'),
              children: (
                <P>
                  {t(
                    'Credit enterprises consume against a period limit (natural month, fixed days, or quota-based which rolls over when the limit is used up). Prepaid enterprises consume the balance topped up offline by the administrator.'
                  )}
                </P>
              ),
            },
            {
              title: t('Bill'),
              children: (
                <P>
                  {t(
                    'When a period closes a bill is issued and emailed to the billing contact. In the console under Bills you can open it, print the invoice and export the usage CSV with per-model unit prices and per-day breakdown.'
                  )}
                </P>
              ),
            },
            {
              title: t('Payment'),
              children: (
                <P>
                  {t(
                    'Pay offline by bank transfer; the administrator registers the payment and the bill turns paid. Reminders go out on the due date and 1, 3, 7 and 14 days after it. Quota-based credit without auto-reset resumes service only after the bill is settled.'
                  )}
                </P>
              ),
            },
            {
              title: t('Alerts'),
              children: (
                <P>
                  {t(
                    'The administrator sets a credit alert threshold (80% by default); when period usage crosses it the billing contact gets an email, and another one when the limit is used up.'
                  )}
                </P>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id='contact' title={t('Contact')}>
        <P>
          {t(
            'Account questions — raising limits, changing the billing mode, moving keys between teams in bulk — go to your {{systemName}} account manager.',
            { systemName }
          )}
        </P>
        {salesQrcode && (
          <img
            src={salesQrcode}
            alt={t('Sales contact QR code')}
            className='mt-2 h-40 w-40 rounded-md border'
          />
        )}
      </DocSection>
    </div>
  )
}
