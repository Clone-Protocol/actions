import {
  Connection,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
} from '@solana/spl-token';
import {
  Clone,
  Oracles,
  createSwapInstruction,
  Pools,
  SwapInstructionAccounts,
  SwapInstructionArgs,
  UpdatePricesInstructionAccounts,
  UpdatePricesInstructionArgs,
  createUpdatePricesInstruction,
  createInitializeUserInstruction,
  InitializeUserInstructionAccounts,
  InitializeUserInstructionArgs,
  createAddCollateralToCometInstruction,
  AddCollateralToCometInstructionAccounts,
  AddCollateralToCometInstructionArgs,
  createAddLiquidityToCometInstruction,
  AddLiquidityToCometInstructionAccounts,
  AddLiquidityToCometInstructionArgs,
  User,
} from 'clone-protocol-sdk/sdk/generated/clone';
import { BN } from 'bn.js';
import { prepareTransactionWithConnection } from '../shared/transaction-utils';

const CLONE_PROGRAM_ID = new PublicKey(
  'C1onEW2kPetmHmwe74YC1ESx3LnFEpVau6g2pg4fHycr',
);
const CLONE_ACCOUNT_ADDRESS = PublicKey.findProgramAddressSync(
  [Buffer.from('clone')],
  CLONE_PROGRAM_ID,
)[0];
const ORACLES_ADDRESS = PublicKey.findProgramAddressSync(
  [Buffer.from('oracles')],
  CLONE_PROGRAM_ID,
)[0];
const POOLS_ADDRESS = PublicKey.findProgramAddressSync(
  [Buffer.from('pools')],
  CLONE_PROGRAM_ID,
)[0];

export const getSwapTransaction = async (
  connection: Connection,
  account: string,
  poolIndex: number,
  amount: string,
): Promise<VersionedTransaction> => {
  const [clone, oracles, pools] = await Promise.all([
    Clone.fromAccountAddress(connection, CLONE_ACCOUNT_ADDRESS),
    Oracles.fromAccountAddress(connection, ORACLES_ADDRESS),
    Pools.fromAccountAddress(connection, POOLS_ADDRESS),
  ]);
  const pool = pools.pools[poolIndex];
  const oracle = oracles.oracles[pool.assetInfo.oracleInfoIndex];
  const collateralOracle = oracles.oracles[clone.collateral.oracleInfoIndex];

  const user = new PublicKey(account);
  const userCollateralTokenAccount = getAssociatedTokenAddressSync(
    clone.collateral.mint,
    user,
    true,
  );
  const userClassetTokenAccount = getAssociatedTokenAddressSync(
    pool.assetInfo.onassetMint,
    user,
    true,
  );
  const treasuryCollateralTokenAccount = getAssociatedTokenAddressSync(
    clone.collateral.mint,
    clone.treasuryAddress,
    true,
  );
  const treasuryClasetTokenAccount = getAssociatedTokenAddressSync(
    pool.assetInfo.onassetMint,
    clone.treasuryAddress,
    true,
  );

  let instructions = [
    createAssociatedTokenAccountIdempotentInstruction(
      user,
      userClassetTokenAccount,
      user,
      pool.assetInfo.onassetMint,
    ),
    createSwapInstruction(
      {
        user,
        clone: CLONE_ACCOUNT_ADDRESS,
        pools: POOLS_ADDRESS,
        oracles: ORACLES_ADDRESS,
        userCollateralTokenAccount,
        userOnassetTokenAccount: userClassetTokenAccount,
        onassetMint: pool.assetInfo.onassetMint,
        collateralMint: clone.collateral.mint,
        collateralVault: clone.collateral.vault,
        treasuryCollateralTokenAccount,
        treasuryOnassetTokenAccount: treasuryClasetTokenAccount,
        anchorRemainingAccounts: [
          {
            pubkey: collateralOracle.address,
            isSigner: false,
            isWritable: false,
          },
          { pubkey: oracle.address, isSigner: false, isWritable: false },
        ],
      } as SwapInstructionAccounts,
      {
        poolIndex,
        quantity: new BN(amount).mul(new BN('1000000')), // Convert to USDC decimals
        quantityIsCollateral: true,
        quantityIsInput: true,
        resultThreshold: 0,
      } as SwapInstructionArgs,
    ),
  ];

  const transaction = await prepareTransactionWithConnection(
    connection,
    instructions,
    user,
  );

  return transaction;
};

export const getLPTransaction = async (
  connection: Connection,
  account: string,
  poolIndex: number,
  collateralAmount: string,
) => {
  const [clone, oracles, pools] = await Promise.all([
    Clone.fromAccountAddress(connection, CLONE_ACCOUNT_ADDRESS),
    Oracles.fromAccountAddress(connection, ORACLES_ADDRESS),
    Pools.fromAccountAddress(connection, POOLS_ADDRESS),
  ]);

  let payer = new PublicKey(account);

  let instructions: TransactionInstruction[] = [];

  // Check if user has account
  const [userAccount, _] = PublicKey.findProgramAddressSync(
    [Buffer.from('user'), payer.toBuffer()],
    CLONE_PROGRAM_ID,
  );

  let user: User | undefined = undefined;
  try {
    user = await User.fromAccountAddress(connection, userAccount);
  } catch {
    instructions.push(
      createInitializeUserInstruction(
        {
          payer,
          userAccount,
        } as InitializeUserInstructionAccounts,
        {
          authority: payer,
        } as InitializeUserInstructionArgs,
      ),
    );
  }

  const collateralBN = new BN(collateralAmount).mul(new BN('1000000'));
  const liquidityBN = collateralBN.div(new BN(2));

  // Add collateral to user account
  instructions.push(
    createAddCollateralToCometInstruction(
      {
        user: payer,
        userAccount,
        clone: CLONE_ACCOUNT_ADDRESS,
        vault: clone.collateral.vault,
        userCollateralTokenAccount: getAssociatedTokenAddressSync(
          clone.collateral.mint,
          payer,
          true,
        ),
      } as AddCollateralToCometInstructionAccounts,
      {
        poolIndex,
        collateralAmount: collateralBN,
      } as AddCollateralToCometInstructionArgs,
    ),
    // Update prices
    createUpdatePricesInstruction(
      {
        oracles: ORACLES_ADDRESS,
        anchorRemainingAccounts: [
          ...oracles.oracles.map((oracle) => {
            return {
              pubkey: oracle.address,
              isSigner: false,
              isWritable: false,
            };
          }),
        ],
      } as UpdatePricesInstructionAccounts,
      {
        oracleIndices: new Uint8Array(
          Array.from({ length: oracles.oracles.length }, (_, index) => index),
        ),
      } as UpdatePricesInstructionArgs,
    ),
    // Add liquidity position to user account
    createAddLiquidityToCometInstruction(
      {
        user: payer,
        userAccount,
        clone: CLONE_ACCOUNT_ADDRESS,
        pools: POOLS_ADDRESS,
        oracles: ORACLES_ADDRESS,
      } as AddLiquidityToCometInstructionAccounts,
      {
        poolIndex,
        collateralAmount: liquidityBN,
      } as AddLiquidityToCometInstructionArgs,
    ),
  );

  const transaction = await prepareTransactionWithConnection(
    connection,
    instructions,
    payer,
  );

  return transaction;
};
