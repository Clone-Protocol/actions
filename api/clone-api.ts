import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
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
