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
// tokenfunc 二开：文档「在线调试」使用的 OpenAPI 规范。只覆盖文档中心写到的接口，
// 请求体示例用本站真实可用的模型名，参数说明以各 API 页为准，这里保持精简。
import type { ModelFamily } from '../registry'

/** 文档页可以打开的调试接口；key 用于 :::api-playground{operation=...} */
export const PLAYGROUND_OPERATIONS = {
  'list-models': { path: '/v1/models', method: 'get' },
  'chat-completions': { path: '/v1/chat/completions', method: 'post' },
  messages: { path: '/v1/messages', method: 'post' },
  responses: { path: '/v1/responses', method: 'post' },
  'image-generations': { path: '/v1/images/generations', method: 'post' },
  'image-edits': { path: '/v1/images/edits', method: 'post' },
  'gemini-generate': {
    path: '/v1beta/models/{model}:generateContent',
    method: 'post',
  },
} as const

export type PlaygroundOperation = keyof typeof PLAYGROUND_OPERATIONS

export function isPlaygroundOperation(
  value: string | undefined
): value is PlaygroundOperation {
  return Boolean(value && value in PLAYGROUND_OPERATIONS)
}

const looseObject = { type: 'object', additionalProperties: true }

function jsonBody(example: Record<string, unknown>) {
  return {
    required: true,
    content: { 'application/json': { schema: looseObject, example } },
  }
}

const jsonResponse = {
  200: {
    description: 'OK',
    content: { 'application/json': { schema: looseObject } },
  },
}

/** 生成调试规范；models 为各系列当前的示例模型 */
export function buildPlaygroundSpec(
  siteName: string,
  models: Record<ModelFamily, string>
): Record<string, unknown> {
  const bearer = [{ bearerAuth: [] }]
  return {
    openapi: '3.1.0',
    info: { title: `${siteName} API`, version: '1.0.0' },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
        anthropicKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        googleKey: { type: 'apiKey', in: 'header', name: 'x-goog-api-key' },
      },
    },
    paths: {
      '/v1/models': {
        get: {
          operationId: 'list-models',
          summary: 'List models',
          security: bearer,
          responses: jsonResponse,
        },
      },
      '/v1/chat/completions': {
        post: {
          operationId: 'chat-completions',
          summary: 'Chat Completions',
          security: bearer,
          requestBody: jsonBody({
            model: models.gpt,
            messages: [{ role: 'user', content: 'Hello!' }],
            max_tokens: 256,
          }),
          responses: jsonResponse,
        },
      },
      '/v1/messages': {
        post: {
          operationId: 'messages',
          summary: 'Anthropic Messages',
          security: [{ anthropicKey: [] }],
          parameters: [
            {
              name: 'anthropic-version',
              in: 'header',
              required: true,
              schema: { type: 'string', default: '2023-06-01' },
              example: '2023-06-01',
            },
          ],
          requestBody: jsonBody({
            model: models.claude,
            max_tokens: 256,
            messages: [{ role: 'user', content: 'Hello!' }],
          }),
          responses: jsonResponse,
        },
      },
      '/v1/responses': {
        post: {
          operationId: 'responses',
          summary: 'Responses',
          security: bearer,
          requestBody: jsonBody({
            model: models.gpt,
            input: 'Hello!',
            max_output_tokens: 256,
          }),
          responses: jsonResponse,
        },
      },
      '/v1/images/generations': {
        post: {
          operationId: 'image-generations',
          summary: 'Image generation',
          security: bearer,
          requestBody: jsonBody({
            model: models.image,
            prompt: 'An orange cat wearing a scarf, watercolor style',
            size: '1024x1024',
            n: 1,
          }),
          responses: jsonResponse,
        },
      },
      '/v1/images/edits': {
        post: {
          operationId: 'image-edits',
          summary: 'Image edit',
          security: bearer,
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['model', 'image', 'prompt'],
                  properties: {
                    model: { type: 'string', example: models.image },
                    image: { type: 'string', format: 'binary' },
                    prompt: {
                      type: 'string',
                      example: 'Give the cat a red hat',
                    },
                  },
                },
              },
            },
          },
          responses: jsonResponse,
        },
      },
      '/v1beta/models/{model}:generateContent': {
        post: {
          operationId: 'gemini-generate',
          summary: 'Gemini generateContent',
          security: [{ googleKey: [] }],
          parameters: [
            {
              name: 'model',
              in: 'path',
              required: true,
              schema: { type: 'string', default: models.gemini },
              example: models.gemini,
            },
          ],
          requestBody: jsonBody({
            contents: [{ role: 'user', parts: [{ text: 'Hello!' }] }],
          }),
          responses: jsonResponse,
        },
      },
    },
  }
}
