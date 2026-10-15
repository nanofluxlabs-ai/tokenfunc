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
import { useTranslation } from 'react-i18next'

import { CodeBlock } from '@/components/ai-elements/code-block'

import { CodeSample } from '../components/code-sample'
import { Note, P } from '../components/doc-prose'
import { DocSection } from '../components/doc-section'
import { EndpointHeader } from '../components/endpoint-header'
import { ParamTable, type DocsParam } from '../components/param-table'
import { DOCS_API_KEY_ENV, useDocsBaseUrl } from '../hooks/use-docs-base-url'
import { buildLangTabs } from '../lib/code-sample-tabs'
import {
  buildImageEditsSample,
  buildImageGenerationsSample,
} from '../lib/samples'

const PARAMS: DocsParam[] = [
  {
    name: 'model',
    type: 'string',
    required: true,
    descriptionKey:
      'The image model to use; see Model Square for the models enabled on this site.',
  },
  {
    name: 'prompt',
    type: 'string',
    required: true,
    descriptionKey:
      'A text description of the desired image (or of the edit to apply).',
  },
  {
    name: 'n',
    type: 'integer',
    defaultValue: '1',
    descriptionKey: 'How many images to generate.',
  },
  {
    name: 'size',
    type: 'string',
    descriptionKey:
      'Image dimensions such as 1024x1024; supported values depend on the model.',
  },
  {
    name: 'response_format',
    type: 'string',
    descriptionKey:
      'url returns a temporary link, b64_json returns base64-encoded image data.',
  },
  {
    name: 'quality',
    type: 'string',
    descriptionKey:
      'Rendering quality tier, for models that support it (e.g. high, medium, low).',
  },
]

export default function ApiImagesPage() {
  const { t } = useTranslation()
  const baseUrl = useDocsBaseUrl()
  const ctx = { baseUrl, apiKeyEnv: DOCS_API_KEY_ENV }

  return (
    <div>
      <P>
        {t(
          'Generate images from text prompts, or edit an existing image, using the OpenAI-compatible image endpoints.'
        )}
      </P>

      <div className='space-y-3'>
        <EndpointHeader
          method='POST'
          path='/v1/images/generations'
          description={t('Create an image from a prompt')}
        />
        <EndpointHeader
          method='POST'
          path='/v1/images/edits'
          description={t('Edit an uploaded image (multipart)')}
        />
      </div>

      <DocSection id='generate' title={t('Generate an image')}>
        <CodeSample
          tabs={buildLangTabs((lang) => buildImageGenerationsSample(lang, ctx))}
        />
      </DocSection>

      <DocSection id='parameters' title={t('Parameters')}>
        <ParamTable params={PARAMS} />
      </DocSection>

      <DocSection id='response' title={t('Response example')}>
        <CodeBlock
          code={JSON.stringify(
            {
              created: 1760000000,
              data: [
                {
                  url: 'https://cdn.example.com/images/img_abc123.png',
                  revised_prompt:
                    'A lighthouse on a cliff at sunset, watercolor style',
                },
              ],
            },
            null,
            2
          )}
          language='json'
          enableCollapse={false}
          className='my-0'
        />
        <P>
          {t(
            'With response_format: b64_json the data items carry b64_json instead of url. Image generation is billed per output image; check Model Square for pricing.'
          )}
        </P>
      </DocSection>

      <DocSection id='edit' title={t('Edit an image')}>
        <P>
          {t(
            'The edits endpoint takes multipart/form-data: upload the source image plus a prompt describing the change.'
          )}
        </P>
        <CodeSample
          tabs={buildLangTabs((lang) => buildImageEditsSample(lang, ctx))}
        />
        <Note>
          {t(
            'Some models accept extra fields such as mask (a PNG whose transparent areas mark where to edit) or input_fidelity to preserve the original look — pass through whatever fields your model documents.'
          )}
        </Note>
      </DocSection>
    </div>
  )
}
