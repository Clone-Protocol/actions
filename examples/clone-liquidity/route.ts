import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  actionSpecOpenApiPostRequestBody,
  actionsSpecOpenApiGetResponse,
  actionsSpecOpenApiPostResponse,
} from '../openapi';
import {
  ActionGetResponse,
  ActionPostRequest,
  ActionPostResponse,
} from '@solana/actions';
import { getLPTransaction } from '../../api/clone-api';
import { Connection } from '@solana/web3.js';

export const CLONE_LOGO =
  'https://github.com/Clone-Protocol/actions/blob/ade118facb5727e908e8837e2cbfc605c04445e0/images/clone_liquidity.png?raw=true';

const DEPOSIT_AMOUNT_USD_OPTIONS = [100, 500, 1000];
const DEFAULT_DEPOSIT_AMOUNT_USD = 100;
const US_DOLLAR_FORMATTING = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const errorResponse = (error?: string) => {
  return Response.json({
    icon: CLONE_LOGO,
    label: 'Not Available',
    title: `Deposit collateral and provide liquidity into Cloned Asset pools`,
    description: `LP Cloned Assets.`,
    disabled: true,
    error: {
      message: error ?? `Pool not found.`,
    },
  } satisfies ActionGetResponse);
};

const responseLabels = (poolName: string, amount?: number) => {
  return {
    label: `LP into the ${poolName} pool` + (amount ? ` with ${US_DOLLAR_FORMATTING.format(amount)}` : ''),
    title: `Provide liquidity into ${poolName} pool`,
    description: `Effortlessly provide liquidity to the ${poolName} pool with just one click! Deposit your USDC collateral and open a position with ease!`,
  };
};

const app = new OpenAPIHono();

const poolTickers = [
  'clARB-USDC',
  'clOP-USDC',
  'clSUI-USDC',
  'clDOGE-USDC',
  'clBNB-USDC',
  'clAPT-USDC',
  'cl1MPEPE-USDC',
];

app.openapi(
  createRoute({
    method: 'get',
    path: '/{tokenPair}',
    tags: ['Clone Liquidity'],
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
    const poolIndex = poolTickers
      .map((x) => x.toLowerCase())
      .indexOf(tokenPair.toLowerCase());

    if (poolIndex === -1) {
      return errorResponse();
    }
    const [_, inputToken] = poolTickers[poolIndex].split('-');
    const amountParameterName = 'amount';

    const response: ActionGetResponse = {
      ...responseLabels(poolTickers[poolIndex]),
      icon: CLONE_LOGO,
      links: {
        actions: [
          ...DEPOSIT_AMOUNT_USD_OPTIONS.map((amount) => ({
            label: `${US_DOLLAR_FORMATTING.format(amount)}`,
            href: `/api/clone/liquidity/${tokenPair}/${amount}`,
          })),
          {
            href: `/api/clone/liquidity/${tokenPair}/{${amountParameterName}}`,
            label: `Deposit + LP`,
            parameters: [
              {
                name: amountParameterName,
                label: `Custom ${inputToken} amount`,
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
    tags: ['Clone Liquidity'],
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
            example: '100',
          }),
      }),
    },
    responses: actionsSpecOpenApiGetResponse,
  }),
  async (c) => {
    const amount = c.req.param('amount');
    const tokenPair = c.req.param('tokenPair');

    const poolIndex = poolTickers
      .map((x) => x.toLowerCase())
      .indexOf(tokenPair.toLowerCase());

    if (poolIndex === -1) {
      return errorResponse();
    }

    const response: ActionGetResponse = {
      icon: CLONE_LOGO,
      ...responseLabels(poolTickers[poolIndex], Number(amount)),
    };

    return c.json(response);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/{tokenPair}/{amount}',
    tags: ['Clone Liquidity'],
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
            example: '100',
          }),
      }),
      body: actionSpecOpenApiPostRequestBody,
    },
    responses: actionsSpecOpenApiPostResponse,
  }),
  async (c) => {
    const amount =
      c.req.param('amount') ?? DEFAULT_DEPOSIT_AMOUNT_USD.toString();
    const { account } = (await c.req.json()) as ActionPostRequest;
    const tokenPair = c.req.param('tokenPair');
    const poolIndex = poolTickers
      .map((x) => x.toLowerCase())
      .indexOf(tokenPair.toLowerCase());
    if (poolIndex === -1) {
      return errorResponse();
    }
    const url = process.env.RPC_URL ?? 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(url);

    try {
      const transaction = await getLPTransaction(
        connection,
        account,
        poolIndex,
        amount,
      );
      let response: ActionPostResponse = {
        transaction: Buffer.from(transaction.serialize()).toString('base64'),
      };
      return c.json(response);
    } catch (error) {
      return errorResponse(JSON.stringify(error));
    }
  },
);

export default app;
