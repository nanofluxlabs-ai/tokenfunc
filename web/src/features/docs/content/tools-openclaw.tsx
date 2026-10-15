/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import {
  CodeBlock,
  CodeBlockCopyButton,
} from '@/components/ai-elements/code-block'

import { BaseUrlCard } from '../components/base-url-card'
import { DocSteps, Note, P } from '../components/doc-prose'
import { DocSection } from '../components/doc-section'
import { DOCS_API_KEY_ENV, useDocsBaseUrl } from '../hooks/use-docs-base-url'
import { buildOpenClawProviderSample } from '../lib/samples'

export default function ToolsOpenClawPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()
  const ctx = { baseUrl, apiKeyEnv: DOCS_API_KEY_ENV }

  return (
    <div>
      <P>
        {t(
          'OpenClaw is an open-source personal AI assistant that runs on your own hardware and shows up in your chat apps. It speaks the Anthropic protocol, so it pairs naturally with this gateway.'
        )}
      </P>

      <BaseUrlCard />

      <DocSection id='setup' title={t('Setup')}>
        <DocSteps
          items={[
            {
              title: t('Create an API key on this site'),
              children: (
                <P>
                  <Link
                    to='/keys'
                    className='text-foreground underline underline-offset-4'
                  >
                    {t('API keys')}
                  </Link>
                  {' — '}
                  {t(
                    'create a dedicated key for OpenClaw so you can revoke or re-scope it independently.'
                  )}
                </P>
              ),
            },
            {
              title: t('Add the gateway as a custom provider'),
              children: (
                <>
                  <P>
                    {t(
                      'OpenClaw keeps provider and model settings in ~/.openclaw/openclaw.json. The sketch below registers the gateway as an Anthropic-protocol provider and exposes one model through it.'
                    )}
                  </P>
                  <CodeBlock
                    code={buildOpenClawProviderSample(ctx)}
                    language='json'
                    enableCollapse={false}
                    className='my-0'
                  >
                    <CodeBlockCopyButton />
                  </CodeBlock>
                  <P>
                    {t(
                      'Prefer the UI? Open the OpenClaw control interface and add the same values under models and providers — the file below updates automatically.'
                    )}
                  </P>
                </>
              ),
            },
            {
              title: t('Verify the model is available'),
              children: (
                <P>
                  {t(
                    'Run openclaw models (or check the models screen in the control UI): the new tokenfunc entry should list its models. Pick one and send a message in any connected chat app.'
                  )}
                </P>
              ),
            },
          ]}
        />
      </DocSection>

      <DocSection id='troubleshooting' title={t('Troubleshooting')}>
        <Note>
          {t(
            'OpenClaw provider config supports more fields than shown here (routing, fallbacks, rate limits). If your setup differs, keep the baseUrl and apiKey values from the sketch and follow the official OpenClaw configuration docs.'
          )}
        </Note>
        <Note>
          {t('Requests fail while other tools work')}{' '}
          {t(
            '— confirm baseUrl has no trailing /v1 for Anthropic-protocol providers, and that the model ID exists on this site.'
          )}
        </Note>
      </DocSection>
    </div>
  )
}
