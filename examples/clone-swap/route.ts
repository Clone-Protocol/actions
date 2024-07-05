import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  actionSpecOpenApiPostRequestBody,
  actionsSpecOpenApiGetResponse,
  actionsSpecOpenApiPostResponse,
} from '../openapi';
import {
  ActionError,
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
} from '@solana/actions';
import { getSwapTransaction } from '../../api/clone-api';
import { Connection } from '@solana/web3.js';

export const CLONE_LOGO =
  'https://pbs.twimg.com/media/GOSLcp-XUAAH7JE?format=jpg&name=medium';//'https://ucarecdn.com/09c80208-f27c-45dd-b716-75e1e55832c4/-/preview/1000x981/-/quality/smart/-/format/auto/';

const SWAP_AMOUNT_USD_OPTIONS = [10, 100, 1000];
const DEFAULT_SWAP_AMOUNT_USD = 10;
const US_DOLLAR_FORMATTING = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const app = new OpenAPIHono();

const poolTickers = [
    "clARB-USDC",
    "clOP-USDC",
    "clSUI-USDC",
    "clDOGE-USDC",
    "clBNB-USDC",
    "clAPT-USDC",
    "cl1MPEPE-USDC",
]

app.openapi(
  createRoute({
    method: 'get',
    path: '/{tokenPair}',
    tags: ['Clone Swap'],
    request: {
      params: z.object({
        tokenPair: z.string().openapi({
          param: {
            name: 'tokenPair',
            in: 'path',
          },
          type: 'string',
          example: poolTickers[0],
        }),
      }),
    },
    responses: actionsSpecOpenApiGetResponse,
  }),
  async (c) => {
    const tokenPair = c.req.param('tokenPair');
    const poolIndex = poolTickers.map(x => x.toLowerCase()).indexOf(tokenPair.toLowerCase());

    if (poolIndex === -1) {
      return Response.json({
        icon: CLONE_LOGO,
        label: 'Not Available',
        title: `Buy Cloned Assets`,
        description: `Buy Cloned Assets.`,
        disabled: true,
        error: {
          message: `Pool not found.`,
        },
      } satisfies ActionGetResponse);
    }

    const [outputToken, inputToken] = poolTickers[poolIndex].split('-');
    const amountParameterName = 'amount';

    const response: ActionGetResponse = {
      icon: CLONE_LOGO,
      label: `Buy ${outputToken}`,
      title: `Buy ${outputToken}`,
      description: `Buy ${outputToken} with ${inputToken}. Choose a ${inputToken} amount from the options below, or enter a custom amount.`,
      links: {
        actions: [
          ...SWAP_AMOUNT_USD_OPTIONS.map((amount) => ({
            label: `${US_DOLLAR_FORMATTING.format(amount)}`,
            href: `/api/clone/swap/${inputToken}/${amount}`,
          })),
          {
            href: `/api/clone/swap/${tokenPair}/{${amountParameterName}}`,
            label: `Buy ${outputToken}`,
            parameters: [
              {
                name: amountParameterName,
                label: `Enter a custom ${inputToken} amount`,
              },
            ],
          },
        ],
      },
    };

    return c.json(response);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{tokenPair}/{amount}',
    tags: ['Clone Swap'],
    request: {
      params: z.object({
        tokenPair: z.string().openapi({
          param: {
            name: 'tokenPair',
            in: 'path',
          },
          type: 'string',
          example: poolTickers[0],
        }),
        amount: z
          .string()
          .optional()
          .openapi({
            param: {
              name: 'amount',
              in: 'path',
              required: false,
            },
            type: 'number',
            example: '1',
          }),
      }),
    },
    responses: actionsSpecOpenApiGetResponse,
  }),
  async (c) => {
    const tokenPair = c.req.param('tokenPair');
    const poolIndex = poolTickers.map(x => x.toLowerCase()).indexOf(tokenPair.toLowerCase());

    if (poolIndex === -1) {
      return Response.json({
        icon: CLONE_LOGO,
        label: 'Not Available',
        title: `Buy Cloned Assets`,
        description: `Buy Cloned Assets.`,
        disabled: true,
        error: {
          message: `Pool not found.`,
        },
      } satisfies ActionGetResponse);
    }

    const [outputToken, inputToken] = poolTickers[poolIndex].split('-');
    const response: ActionGetResponse = {
      icon: CLONE_LOGO,
      label: `Buy ${outputToken}`,
      title: `Buy ${outputToken} with ${inputToken}`,
      description: `Buy ${outputToken} with ${inputToken}.`,
    };

    return c.json(response);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/{tokenPair}/{amount}',
    tags: ['Clone Swap'],
    request: {
      params: z.object({
        tokenPair: z.string().openapi({
          param: {
            name: 'tokenPair',
            in: 'path',
          },
          type: 'string',
          example: poolTickers[0],
        }),
        amount: z
          .string()
          .optional()
          .openapi({
            param: {
              name: 'amount',
              in: 'path',
              required: false,
            },
            type: 'number',
            example: '1',
          }),
      }),
      body: actionSpecOpenApiPostRequestBody,
    },
    responses: actionsSpecOpenApiPostResponse,
  }),
  async (c) => {
    const amount = c.req.param('amount') ?? DEFAULT_SWAP_AMOUNT_USD.toString();
    const { account } = (await c.req.json()) as ActionPostRequest;
    const tokenPair = c.req.param('tokenPair');
    const poolIndex = poolTickers.map(x => x.toLowerCase()).indexOf(tokenPair.toLowerCase());
    if (poolIndex === -1) {
      return Response.json({
        icon: CLONE_LOGO,
        label: 'Not Available',
        title: `Buy Cloned Assets`,
        description: `Buy Cloned Assets.`,
        disabled: true,
        error: {
          message: `Pool not found.`,
        },
      } satisfies ActionGetResponse);
    }

    const url = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
    const connection = new Connection(url);

    try {
        const transaction = await getSwapTransaction(connection, account, poolIndex, amount)
        let response: ActionPostResponse = {
            transaction: transaction.compileMessage().serialize().toString('base64'),
          };
        return c.json(response);
    } catch (error) {
        return Response.json({
            icon: CLONE_LOGO,
            label: 'Unable to create transaction',
            title: `Buy Cloned Assets`,
            description: `Buy Cloned Assets.`,
            disabled: true,
            error: {
              message: JSON.stringify(error),
            },
        } satisfies ActionGetResponse );
    }
  },
);

export default app;
