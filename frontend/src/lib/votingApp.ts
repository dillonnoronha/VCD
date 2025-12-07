import { browser } from '$app/environment';
import {
	Contract,
	BrowserProvider,
	JsonRpcProvider,
	parseEther,
	formatEther,
	keccak256,
	toUtf8Bytes,
	type Eip1193Provider,
	type InterfaceAbi
} from 'ethers';
import { writable, get, type Writable } from 'svelte/store';
// import votingHubArtifact from '$lib/abi/VotingHubInterface.json';

// Current dir \\192.168.1.143\trung\Other\Project\_edu_\CSPC559\VCD\frontend\src\lib
// Target dir fort he contract: \\192.168.1.143\trung\Other\Project\_edu_\CSPC559\VCD\artifacts\contracts\VotingHubInterface.sol\VotingHubInterface.json

import votingHubArtifact from '../../../artifacts/contracts/VotingHubInterface.sol/VotingHubInterface.json';

const envAddress = (import.meta as any).env?.VITE_VOTING_HUB_ADDRESS as string | undefined;
const envRpcUrl = (import.meta as any).env?.VITE_RPC_URL as string | undefined;

export type ProviderSource = 'metamask' | 'local' | null;

type AllocationResult = { optionId: bigint; weight: bigint };
type OptionStructOutput = { name: string; weight: bigint };
type VotingHubContract = Contract & {
	listSessions(): Promise<readonly bigint[]>;
	getSessionMeta(
		id: bigint
	): Promise<
		readonly [
			string,
			bigint,
			bigint,
			bigint,
			bigint,
			boolean,
			boolean,
			boolean,
			boolean,
			bigint,
			bigint
		]
	>;
	getOptions(id: bigint): Promise<OptionStructOutput[]>;
	canSeeResults(id: bigint, viewer: string): Promise<boolean>;
	getOptionTotals(id: bigint): Promise<readonly bigint[]>;
	getWinners(id: bigint): Promise<readonly bigint[]>;
	getVoteAllocations(
		id: bigint,
		voter: string
	): Promise<readonly [bigint, AllocationResult[], boolean, string, bigint]>;
	castVote(id: bigint, allocs: AllocationResult[], finalize: boolean): Promise<unknown>;
	updateVote(id: bigint, allocs: AllocationResult[], finalize: boolean): Promise<unknown>;
	revokeVote(id: bigint): Promise<unknown>;
	confirmVote(id: bigint): Promise<unknown>;
	delegateVote(id: bigint, to: string): Promise<unknown>;
	purchaseWeight(id: bigint, overrides: { value: bigint }): Promise<unknown>;
	revealResults(id: bigint): Promise<unknown>;
	emitSessionEnd(id: bigint): Promise<unknown>;
	forceEndSession(id: bigint): Promise<unknown>;
	staticCall: {
		createSession(
			name: string,
			optionNames: string[],
			optionWeights: bigint[],
			start: bigint,
			end: bigint,
			reveal: bigint,
			algorithm: bigint,
			allowAnonymous: boolean,
			allowMultiVoteWithEth: boolean,
			concealResults: boolean,
			viewers: string[],
			pricePerWeight: bigint,
			defaultBaseWeight: bigint
		): Promise<unknown>;
		castVote(id: bigint, allocs: AllocationResult[], finalize: boolean): Promise<unknown>;
		updateVote(id: bigint, allocs: AllocationResult[], finalize: boolean): Promise<unknown>;
		revokeVote(id: bigint): Promise<unknown>;
		confirmVote(id: bigint): Promise<unknown>;
	delegateVote(id: bigint, to: string): Promise<unknown>;
	purchaseWeight(id: bigint, overrides: { value: bigint }): Promise<unknown>;
	revealResults(id: bigint): Promise<unknown>;
	emitSessionEnd(id: bigint): Promise<unknown>;
	forceEndSession(id: bigint): Promise<unknown>;
	listSessions(): Promise<bigint[]>;
};
};

export type SessionView = {
	id: bigint;
	name: string;
	startTime: bigint;
	endTime: bigint;
	revealTime: bigint;
	chainTimestamp: bigint;
	isActive: boolean;
	algorithm: number;
	allowAnonymous: boolean;
	allowMultiVoteWithEth: boolean;
	concealResults: boolean;
	revealed: boolean;
	optionCount: bigint;
	pricePerWeight: bigint;
	defaultBaseWeight: bigint;
	options: OptionStructOutput[];
	canSeeResults: boolean;
	totals: readonly bigint[] | null;
	winners: readonly bigint[] | null;
	voterVotes:
		| { voter: string | null; allocations: AllocationResult[]; usedWeight: bigint }[]
		| null;
	voteStatus: 'None' | 'Pending' | 'Confirmed' | null;
	usedWeight: bigint | null;
	allocations: AllocationResult[] | null;
	anonymousVote: boolean;
	weightAllowance: bigint | null;
	myBaseWeight: bigint | null;
	myPurchasedWeight: bigint | null;
	myReceivedDelegatedWeight: bigint | null;
	myAvailableWeight: bigint | null;
	myDelegate: string | null;
	myDelegators: string[];
};

export type State = {
	status: string;
	contractAddress: string;
	rpcUrl: string;
	providerSource: ProviderSource;
	networkId: number | null;
	account: string;
	availableAccounts: string[];
	chainTimestamp: bigint | null;
	lastMineAttempt: number | null;
	hideRevealed: boolean;
	hideFinished: boolean;
	ownerAddress: string;
	isOwner: boolean;
	metamaskAvailable: boolean;
	connecting: boolean;
	loadingSessions: boolean;
	sessions: SessionView[];
	actionSessionId: bigint | null;
	castingSessionId: bigint | null;
	updatingSessionId: bigint | null;
	purchasingSessionId: bigint | null;
	delegatingSessionId: bigint | null;
	revealingSessionId: bigint | null;
	// local client-side record of purchases per account per session (bigint weight)
	purchases: Record<string, Record<string, bigint>>;
	forms: {
		voteOption: Record<string, string>;
		voteWeight: Record<string, string>;
		finalize: Record<string, boolean>;
		anonymous: Record<string, boolean>;
		delegateTo: Record<string, string>;
		purchaseEth: Record<string, string>;
		create: {
			name: string;
			options: { name: string; weight: string }[];
			startOffsetSec: string;
			endOffsetSec: string;
			revealOffsetSec: string;
			algorithm: string;
			allowAnonymous: boolean;
			allowMultiVoteWithEth: boolean;
			concealResults: boolean;
			pricePerWeightEth: string;
			authorizedViewers: string;
			defaultBaseWeight: string;
		};
	};
};

const abi = votingHubArtifact.abi as InterfaceAbi;

class VotingApp {
	private static _instance: VotingApp | null = null;
	static get_instance(): VotingApp {
		if (!VotingApp._instance) VotingApp._instance = new VotingApp();
		return VotingApp._instance;
	}

	private async _try_mine() {
		if (!this._provider) return;
		const now = Date.now();
		if (this._state.lastMineAttempt && now - this._state.lastMineAttempt < 1500) return;
		this._patch({ lastMineAttempt: now });
		const methods = ["evm_mine", "hardhat_mine", "anvil_mine"];
		for (const m of methods) {
			try {
				// hardhat_mine/anvil_mine expect hex block count; evm_mine accepts no params
				await (this._provider as any).send(m, m === "evm_mine" ? [] : ["0x1"]);
				this._set_status("Mined 1 block to advance time.");
				return;
			} catch {
				// keep trying next
			}
		}
	}

	private _writable!: Writable<State>;
	readonly subscribe: Writable<State>['subscribe'];

	private _provider: BrowserProvider | JsonRpcProvider | null = null;
	private _contract: VotingHubContract | null = null;
	private _metamaskCleanup: (() => void) | null = null;
	private _bootstrapped = false;
	private _state!: State;

	private async _rebind_metamask_contract(newAccount?: string) {
		if (!(this._provider instanceof BrowserProvider)) return;
		const state = get(this._writable);
		const signer = await this._provider.getSigner(newAccount ?? state.account);
		this._contract = new Contract(
			state.contractAddress,
			abi,
			signer
		) as unknown as VotingHubContract;
	}

	private constructor() {
		const storedAddress = browser ? (window.localStorage.getItem('voting-hub-address') ?? '') : '';
		const storedRpc = browser ? (window.localStorage.getItem('voting-hub-rpc') ?? '') : '';
		const storedHide = browser
			? window.localStorage.getItem('voting-hide-revealed') === '1'
			: false;
		const storedHideFinished = browser
			? window.localStorage.getItem('voting-hide-finished') === '1'
			: false;
		const hasEthereum = browser && Boolean((globalThis as any).ethereum);
		const writableState: Writable<State> = writable({
			status: 'Enter a contract address and connect.',
			contractAddress: storedAddress,
			rpcUrl: storedRpc,
			providerSource: null,
			networkId: null,
			account: '',
			availableAccounts: [],
			chainTimestamp: null,
			lastMineAttempt: null,
			hideRevealed: storedHide,
			hideFinished: storedHideFinished,
			metamaskAvailable: hasEthereum,
			connecting: false,
			loadingSessions: false,
			sessions: [],
			actionSessionId: null,
			castingSessionId: null,
			updatingSessionId: null,
			purchasingSessionId: null,
			delegatingSessionId: null,
			revealingSessionId: null,
			purchases: {},
			forms: {
				voteOption: {},
				voteWeight: {},
				finalize: {},
				anonymous: {},
				delegateTo: {},
				purchaseEth: {},
				create: {
					name: '',
					options: [
						{ name: 'Option 0', weight: '1' },
						{ name: 'Option 1', weight: '1' }
					],
					startOffsetSec: '5',
					endOffsetSec: '3600',
					revealOffsetSec: '7200',
					algorithm: '0',
					allowAnonymous: true,
					allowMultiVoteWithEth: true,
					concealResults: true,
					pricePerWeightEth: '0.001',
					authorizedViewers: '',
					defaultBaseWeight: '1'
				}
			},
			ownerAddress: '',
			isOwner: false
		});
		this._writable = writableState;
		this._state = get(writableState);
		this.subscribe = this._writable.subscribe;
	}

	// ---------- public setters ----------
	set_contract_address = (value: string) => {
		this._patch({ contractAddress: value.trim() });
		if (browser) window.localStorage.setItem('voting-hub-address', value.trim());
	};

	set_rpc_url = (value: string) => {
		this._patch({ rpcUrl: value.trim() });
		if (browser) window.localStorage.setItem('voting-hub-rpc', value.trim());
	};

	set_hide_revealed = (value: boolean) => {
		this._patch({ hideRevealed: value });
		if (browser) window.localStorage.setItem('voting-hide-revealed', value ? '1' : '0');
	};

	set_hide_finished = (value: boolean) => {
		this._patch({ hideFinished: value });
		if (browser) window.localStorage.setItem('voting-hide-finished', value ? '1' : '0');
	};

	set_vote_option = (sessionId: bigint, opt: string) => {
		this._patch_form('voteOption', sessionId, opt);
	};

	set_vote_weight = (sessionId: bigint, weight: string) => {
		this._patch_form('voteWeight', sessionId, weight);
	};

	set_finalize = (sessionId: bigint, value: boolean) => {
		this._patch_form('finalize', sessionId, value);
	};

	set_anonymous = (sessionId: bigint, value: boolean) => {
		this._patch_form('anonymous', sessionId, value);
	};

	set_delegate_to = (sessionId: bigint, addr: string) => {
		this._patch_form('delegateTo', sessionId, addr);
	};

	set_purchase_eth = (sessionId: bigint, value: string) => {
		this._patch_form('purchaseEth', sessionId, value);
	};

	update_create_option = (index: number, key: 'name' | 'weight', value: string) => {
		this._writable.update((s) => {
			const opts = [...s.forms.create.options];
			if (!opts[index]) return s;
			opts[index] = { ...opts[index], [key]: value };
			return { ...s, forms: { ...s.forms, create: { ...s.forms.create, options: opts } } };
		});
	};

	add_create_option = () => {
		this._writable.update((s) => ({
			...s,
			forms: {
				...s.forms,
				create: {
					...s.forms.create,
					options: [
						...s.forms.create.options,
						{ name: `Option ${s.forms.create.options.length}`, weight: '1' }
					]
				}
			}
		}));
	};

	remove_create_option = (index: number) => {
		this._writable.update((s) => {
			if (s.forms.create.options.length <= 1) return s;
			const opts = s.forms.create.options.filter((_, i) => i !== index);
			return { ...s, forms: { ...s.forms, create: { ...s.forms.create, options: opts } } };
		});
	};

	set_create_field = <K extends keyof State['forms']['create']>(
		key: K,
		value: State['forms']['create'][K]
	) => {
		this._writable.update((s) => ({
			...s,
			forms: { ...s.forms, create: { ...s.forms.create, [key]: value } }
		}));
	};

	create_session = async () => {
		const state = get(this._writable);
		const contract = this._contract;
		if (!contract) {
			this._set_status('Connect first.');
			return;
		}

		const form = state.forms.create;
		const names = form.options.map((o) => o.name.trim()).filter(Boolean);
		const weights = form.options.map((o) => BigInt(o.weight || '0'));
		if (Number(form.algorithm) > 1) {
			this._set_status('Unsupported algorithm. Choose OnePersonOneVote or WeightedSplit.');
			return;
		}
		if (!form.name.trim()) {
			this._set_status('Session name required.');
			return;
		}
		if (!names.length || names.length !== form.options.length) {
			this._set_status('All options need names.');
			return;
		}
		if (weights.some((w) => w <= 0n)) {
			this._set_status('Option weights must be > 0.');
			return;
		}

		const now = Math.floor(Date.now() / 1000);
		const start = BigInt(now + Number(form.startOffsetSec || '0'));
		const end = BigInt(now + Number(form.endOffsetSec || '0'));
		const reveal = BigInt(now + Number(form.revealOffsetSec || '0'));
		if (!(start < end && end < reveal)) {
			this._set_status('Invalid timing: ensure start < end < reveal.');
			return;
		}
		const algorithm = BigInt(form.algorithm || '0');
		const viewers = form.authorizedViewers
			.split(',')
			.map((v) => v.trim())
			.filter(Boolean);

		this._patch({ actionSessionId: -1n, status: 'Simulating session creation...' });
		const dry = await this._dry_run(
			'createSession',
			[
				form.name.trim(),
				form.options.map((o) => o.name.trim()),
				weights,
				start,
				end,
				reveal,
				algorithm,
				form.allowAnonymous,
				form.allowMultiVoteWithEth,
				form.concealResults,
				viewers,
				parseEther(form.pricePerWeightEth || '0'),
				BigInt(form.defaultBaseWeight || '1')
			],
			'Create session failed'
		);
		if (dry) {
			this._set_status(dry);
			this._patch({ actionSessionId: null });
			return;
		}
		this._patch({ status: 'Creating session...' });
		try {
			await contract.createSession(
				form.name.trim(),
				form.options.map((o) => o.name.trim()),
				weights,
				start,
				end,
				reveal,
				algorithm,
				form.allowAnonymous,
				form.allowMultiVoteWithEth,
				form.concealResults,
				viewers,
				parseEther(form.pricePerWeightEth || '0'),
				BigInt(form.defaultBaseWeight || '1')
			);
			this._set_status('Session creation sent.');
			await this.refresh_sessions();
		} catch (err: any) {
			console.error(err);
			this._set_status(this._status_from_error(err, 'Create session failed'));
		} finally {
			this._patch({ actionSessionId: null });
		}
	};

	bootstrap = async () => {
		if (this._bootstrapped || !browser) return;
		this._bootstrapped = true;

		const state = get(this._writable);

		const maybeEnvAddress = envAddress?.trim();
		if (
			maybeEnvAddress &&
			maybeEnvAddress.length === 42 &&
			maybeEnvAddress !== state.contractAddress
		) {
			this.set_contract_address(maybeEnvAddress);
		}
		const maybeEnvRpc = envRpcUrl?.trim();
		if (maybeEnvRpc && maybeEnvRpc !== state.rpcUrl) {
			this.set_rpc_url(maybeEnvRpc);
		}

		try {
			const res = await fetch('/contract-address.json', { cache: 'no-cache' });
			if (res.ok) {
				const data = (await res.json()) as { address?: string; rpcUrl?: string };
				if (
					data.address &&
					data.address.length === 42 &&
					data.address !== get(this._writable).contractAddress
				) {
					this.set_contract_address(data.address);
					this._set_status('Loaded contract address from config.');
				}
				if (data.rpcUrl && data.rpcUrl !== get(this._writable).rpcUrl) {
					this.set_rpc_url(data.rpcUrl);
				}
			}
		} catch (err) {
			console.warn('contract-address.json not loaded', err);
		}
	};

	// ---------- connections ----------
	connect_metamask = async () => {
		if (!browser) return;
		const state = get(this._writable);
		if (state.connecting) return;
		const ethereum = (globalThis as any).ethereum as Eip1193Provider | undefined;
		if (!ethereum) {
			this._set_status('MetaMask not detected.');
			return;
		}
		if (!this._has_contract_address()) return;

		this._patch({
			connecting: true,
			providerSource: 'metamask',
			status: 'Connecting to MetaMask...'
		});
		try {
			const provider = new BrowserProvider(ethereum);
			const accounts = (await provider.send('eth_requestAccounts', [])) as string[];
			if (!accounts.length) throw new Error('No accounts returned by MetaMask');
			const network = await provider.getNetwork();
			const signer = await provider.getSigner();

			// sanity: ensure contract exists on this chain before binding
			const code = await provider.getCode(state.contractAddress);
			if (!code || code === '0x') {
				throw new Error('No contract found at this address on the connected network.');
			}

			const contract = new Contract(
				state.contractAddress,
				abi,
				signer
			) as unknown as VotingHubContract;

			// Quick ABI sanity: read-only call should succeed without tx
			try {
				await contract.nextSessionId();
			} catch (err: any) {
				throw new Error('Address is not a VotingHub diamond (ABI mismatch).');
			}

			this._provider = provider;
			this._contract = contract;
			this._patch({
				account: accounts[0],
				availableAccounts: accounts,
				networkId: Number(network.chainId),
				status: 'Connected to MetaMask.'
			});
			await this._sync_owner();
			this._attach_metamask_listeners(provider);
			await this.refresh_sessions();
		} catch (err: any) {
			console.error(err);
			this._set_status(err?.message ?? 'Failed to connect MetaMask');
		} finally {
			this._patch({ connecting: false });
		}
	};

	connect_local = async () => {
		const state = get(this._writable);
		if (state.connecting) return;
		if (!this._has_contract_address()) return;
		const rpcUrl = state.rpcUrl.trim();
		if (!rpcUrl) {
			this._set_status('Enter an RPC URL before connecting.');
			return;
		}
		this._patch({
			connecting: true,
			providerSource: 'local',
			status: 'Connecting to local RPC...'
		});
		try {
			const provider = new JsonRpcProvider(rpcUrl);
			// Quick reachability check so we can surface "server down" early
			await provider.getBlockNumber();
			const accounts = (await provider.send('eth_accounts', [])) as string[];
			if (!accounts.length) throw new Error('No accounts on local node');
			const signer = await provider.getSigner(accounts[0]);
			const network = await provider.getNetwork();
			const contract = new Contract(
				state.contractAddress,
				abi,
				signer
			) as unknown as VotingHubContract;
			await contract.nextSessionId(); // abi sanity

			this._provider = provider;
			this._contract = contract;
			this._patch({
				account: accounts[0],
				availableAccounts: accounts,
				networkId: Number(network.chainId),
				status: 'Connected to local RPC.'
			});
			await this._sync_owner();
			await this.refresh_sessions();
		} catch (err: any) {
			console.error(err);
			this._set_status(err?.message ?? 'Failed to connect local node');
		} finally {
			this._patch({ connecting: false });
		}
	};

	detach_listeners = () => {
		if (this._metamaskCleanup) this._metamaskCleanup();
	};

	destroy = () => {
		this.detach_listeners();
	};

	// ---------- data refresh ----------
	refresh_sessions = async () => {
		const contract = this._contract;
		if (!contract) {
			this._set_status('Connect first.');
			return;
		}
		this._patch({ loadingSessions: true });
		try {
			const provider = contract.runner?.provider;
			let latest = await provider?.getBlock('latest');
			let chainNow = BigInt(latest?.timestamp ?? Math.floor(Date.now() / 1000));
			const realNow = BigInt(Math.floor(Date.now() / 1000));

			// If chain time lags real time and sessions likely finished/revealable, try to mine a block (dev/local only)
			if (this._provider && this._state.providerSource === 'local') {
				const shouldMine =
					realNow > chainNow &&
					get(this._writable).sessions.some(
						(s) => (s.endTime <= realNow || s.revealTime <= realNow) && chainNow < s.revealTime,
					);
				if (shouldMine) {
					await this._try_mine();
					latest = await provider?.getBlock('latest');
					chainNow = BigInt(latest?.timestamp ?? Math.floor(Date.now() / 1000));
				}
			}

			const ids = await contract.listSessions();
			const sessions: SessionView[] = [];
			for (const rawId of ids) {
				const id = BigInt(rawId);
				const session = await this._load_session(id, chainNow);
				sessions.push(session);
			}
			const now = chainNow;
			sessions.sort((a, b) => {
				const aActive = a.startTime <= now && now < a.endTime;
				const bActive = b.startTime <= now && now < b.endTime;
				if (aActive !== bActive) return aActive ? -1 : 1;
				return Number(a.id - b.id);
			});
			this._patch({
				sessions,
				chainTimestamp: chainNow,
				status: `Loaded ${sessions.length} session${sessions.length === 1 ? '' : 's'}.`
			});
		} catch (err: any) {
			console.error(err);
			this._set_status(err?.message ?? 'Failed to load sessions');
		} finally {
			this._patch({ loadingSessions: false });
		}
	};

	bump_block = async () => {
		await this._try_mine();
		await this.refresh_sessions();
	};

	refresh_single = async (sessionId: bigint) => {
		const contract = this._contract;
		if (!contract) return;
		this._patch({ actionSessionId: sessionId });
		try {
			const latest = await contract.runner?.provider?.getBlock('latest');
			const chainNow = BigInt(latest?.timestamp ?? Math.floor(Date.now() / 1000));
			const updated = await this._load_session(sessionId, chainNow);
			const sessions = get(this._writable).sessions.map((s) => (s.id === sessionId ? updated : s));
			this._patch({ sessions, chainTimestamp: chainNow });
		} catch (err: any) {
			console.error(err);
			this._set_status(err?.message ?? 'Failed to refresh session');
		} finally {
			this._patch({ actionSessionId: null });
		}
	};

	// ---------- actions ----------
	cast_vote = async (sessionId: bigint) => {
		const state = get(this._writable);
		if (!this._contract) return;
		const sessionMeta = state.sessions.find((s) => s.id === sessionId);
		const optionStr = state.forms.voteOption[sessionId.toString()] ?? '';
		const weightStr = state.forms.voteWeight[sessionId.toString()] ?? '';
		const finalize = state.forms.finalize[sessionId.toString()] ?? true;
		const anonymous = state.forms.anonymous[sessionId.toString()] ?? false;
		const optionId = optionStr ? BigInt(optionStr) : null;
		const weight = weightStr ? BigInt(weightStr) : null;
		if (optionId === null || weight === null || weight <= 0n) {
			this._set_status('Provide option and positive weight.');
			return;
		}
		if (anonymous && !(sessionMeta?.allowAnonymous ?? false)) {
			this._set_status('Anonymous voting is disabled for this session.');
			return;
		}

		this._patch({ castingSessionId: sessionId });
		const dry = await this._dry_run(
			anonymous ? 'castAnonymousVote' : 'castVote',
			anonymous
				? [sessionId, this._anon_id(sessionId), [{ optionId, weight }], finalize]
				: [sessionId, [{ optionId, weight }], finalize],
			'Vote failed'
		);
		if (dry) {
			this._set_status(dry);
			this._patch({ castingSessionId: null });
			return;
		}

		this._patch({ castingSessionId: sessionId });
		try {
			if (anonymous) {
				await this._contract.castAnonymousVote(
					sessionId,
					this._anon_id(sessionId),
					[{ optionId, weight }],
					finalize
				);
			} else {
				await this._contract.castVote(sessionId, [{ optionId, weight }], finalize);
			}
			this._set_status('Vote submitted.');
			await this.refresh_single(sessionId);
		} catch (err: any) {
			console.error(err);
			this._set_status(this._status_from_error(err, 'Vote failed'));
		} finally {
			this._patch({ castingSessionId: null });
		}
	};

	update_vote = async (sessionId: bigint) => {
		const state = get(this._writable);
		if (!this._contract) return;
		const sessionMeta = state.sessions.find((s) => s.id === sessionId);
		const optionStr = state.forms.voteOption[sessionId.toString()] ?? '';
		const weightStr = state.forms.voteWeight[sessionId.toString()] ?? '';
		const finalize = state.forms.finalize[sessionId.toString()] ?? true;
		const anonymous = state.forms.anonymous[sessionId.toString()] ?? false;
		const optionId = optionStr ? BigInt(optionStr) : null;
		const weight = weightStr ? BigInt(weightStr) : null;
		if (optionId === null || weight === null || weight <= 0n) {
			this._set_status('Provide option and positive weight.');
			return;
		}
		if (anonymous && !(sessionMeta?.allowAnonymous ?? false)) {
			this._set_status('Anonymous voting is disabled for this session.');
			return;
		}

		this._patch({ updatingSessionId: sessionId });
		const dry = await this._dry_run(
			anonymous ? 'castAnonymousVote' : 'updateVote',
			anonymous
				? [sessionId, this._anon_id(sessionId), [{ optionId, weight }], finalize]
				: [sessionId, [{ optionId, weight }], finalize],
			'Update failed'
		);
		if (dry) {
			this._set_status(dry);
			this._patch({ updatingSessionId: null });
			return;
		}

		this._patch({ updatingSessionId: sessionId });
		try {
			if (anonymous) {
				await this._contract.castAnonymousVote(
					sessionId,
					this._anon_id(sessionId),
					[{ optionId, weight }],
					finalize
				);
			} else {
				await this._contract.updateVote(sessionId, [{ optionId, weight }], finalize);
			}
			this._set_status('Vote updated.');
			await this.refresh_single(sessionId);
		} catch (err: any) {
			console.error(err);
			this._set_status(this._status_from_error(err, 'Update failed'));
		} finally {
			this._patch({ updatingSessionId: null });
		}
	};

	revoke_vote = async (sessionId: bigint) => {
		if (!this._contract) return;
		this._patch({ actionSessionId: sessionId });
		const dry = await this._dry_run('revokeVote', [sessionId], 'Revoke failed');
		if (dry) {
			this._set_status(dry);
			this._patch({ actionSessionId: null });
			return;
		}
		this._patch({ actionSessionId: sessionId });
		try {
			await this._contract.revokeVote(sessionId);
			this._set_status('Vote revoked.');
			await this.refresh_single(sessionId);
		} catch (err: any) {
			console.error(err);
			this._set_status(this._status_from_error(err, 'Revoke failed'));
		} finally {
			this._patch({ actionSessionId: null });
		}
	};

	confirm_vote = async (sessionId: bigint) => {
		if (!this._contract) return;
		const state = get(this._writable);
		const sess = state.sessions.find((s) => s.id === sessionId);
		if (!sess || sess.voteStatus !== 'Pending') {
			this._set_status('No pending vote to confirm for this session.');
			return;
		}
		this._patch({ actionSessionId: sessionId });
		const dry = await this._dry_run('confirmVote', [sessionId], 'Confirm failed');
		if (dry) {
			this._set_status(dry);
			this._patch({ actionSessionId: null });
			return;
		}
		this._patch({ actionSessionId: sessionId });
		try {
			await this._contract.confirmVote(sessionId);
			this._set_status('Vote confirmed.');
			await this.refresh_single(sessionId);
		} catch (err: any) {
			console.error(err);
			this._set_status(this._status_from_error(err, 'Confirm failed'));
		} finally {
			this._patch({ actionSessionId: null });
		}
	};

	delegate_vote = async (sessionId: bigint) => {
		const state = get(this._writable);
		if (!this._contract) return;
		const to = state.forms.delegateTo[sessionId.toString()]?.trim();
		if (!to) {
			this._set_status('Enter delegate address.');
			return;
		}

		this._patch({ delegatingSessionId: sessionId });
		const dry = await this._dry_run('delegateVote', [sessionId, to], 'Delegate failed');
		if (dry) {
			this._set_status(dry);
			this._patch({ delegatingSessionId: null });
			return;
		}

		this._patch({ delegatingSessionId: sessionId });
		try {
			await this._contract.delegateVote(sessionId, to);
			this._set_status('Delegated vote.');
			await this.refresh_single(sessionId);
		} catch (err: any) {
			console.error(err);
			this._set_status(this._status_from_error(err, 'Delegate failed'));
		} finally {
			this._patch({ delegatingSessionId: null });
		}
	};

	purchase_weight = async (sessionId: bigint) => {
		const state = get(this._writable);
		if (!this._contract) return;
		const eth = state.forms.purchaseEth[sessionId.toString()]?.trim();
		if (!eth || Number(eth) <= 0) {
			this._set_status('Enter ETH amount to send.');
			return;
		}

		this._patch({ purchasingSessionId: sessionId });
		const dry = await this._dry_run('purchaseWeight', [sessionId], 'Purchase failed', {
			value: parseEther(eth)
		});
		if (dry) {
			this._set_status(dry);
			this._patch({ purchasingSessionId: null });
			return;
		}

		this._patch({ purchasingSessionId: sessionId });
		try {
			await this._contract.purchaseWeight(sessionId, { value: parseEther(eth) });
			// client-estimate purchased weight increment
			const session = get(this._writable).sessions.find((s) => s.id === sessionId);
			if (session) {
				const price = session.pricePerWeight;
				if (price > 0n) {
					const added = parseEther(eth) / price;
					this._record_purchase(sessionId, added);
				}
			}
			this._set_status('Purchased additional weight.');
			await this.refresh_single(sessionId);
		} catch (err: any) {
			console.error(err);
			this._set_status(this._status_from_error(err, 'Purchase failed'));
		} finally {
			this._patch({ purchasingSessionId: null });
		}
	};

	reveal_results = async (sessionId: bigint) => {
		if (!this._contract) return;
		this._patch({ revealingSessionId: sessionId });
		const dry = await this._dry_run('revealResults', [sessionId], 'Reveal failed');
		if (dry) {
			this._set_status(dry);
			this._patch({ revealingSessionId: null });
			return;
		}
		this._patch({ revealingSessionId: sessionId });
		try {
			await this._contract.revealResults(sessionId);
			this._set_status('Reveal transaction sent.');
			await this.refresh_single(sessionId);
		} catch (err: any) {
			console.error(err);
			this._set_status(this._status_from_error(err, 'Reveal failed'));
		} finally {
			this._patch({ revealingSessionId: null });
		}
	};

	emit_session_end = async (sessionId: bigint) => {
		if (!this._contract) return;
		this._patch({ actionSessionId: sessionId });
		const dry = await this._dry_run('emitSessionEnd', [sessionId], 'Emit failed');
		if (dry) {
			this._set_status(dry);
			this._patch({ actionSessionId: null });
			return;
		}
		this._patch({ actionSessionId: sessionId });
		try {
			await this._contract.emitSessionEnd(sessionId);
			this._set_status('Session end emitted.');
			await this.refresh_single(sessionId);
		} catch (err: any) {
			console.error(err);
			this._set_status(this._status_from_error(err, 'Emit failed'));
		} finally {
			this._patch({ actionSessionId: null });
		}
	};

	force_end_session = async (sessionId: bigint) => {
		if (!this._contract) return;
		this._patch({ actionSessionId: sessionId });
		const dry = await this._dry_run('forceEndSession', [sessionId], 'End failed');
		if (dry) {
			this._set_status(dry);
			this._patch({ actionSessionId: null });
			return;
		}
		this._patch({ actionSessionId: sessionId });
		try {
			await this._contract.forceEndSession(sessionId);
			this._set_status('Session ended early.');
			await this.refresh_single(sessionId);
		} catch (err: any) {
			console.error(err);
			this._set_status(this._status_from_error(err, 'End failed'));
		} finally {
			this._patch({ actionSessionId: null });
		}
	};

	// ---------- helpers ----------
	format_price = (wei: bigint): string => `${formatEther(wei)} ETH per weight`;

	algorithm_label = (alg: number): string => {
		return alg === 0 ? 'OnePersonOneVote' : alg === 1 ? 'WeightedSplit' : `Algorithm ${alg}`;
	};

	// ---------- private ----------
	private _has_contract_address(): boolean {
		const state = get(this._writable);
		if (!state.contractAddress || state.contractAddress.length !== 42) {
			this._set_status('Enter a valid contract address.');
			return false;
		}
		return true;
	}

	private _patch(values: Partial<State>) {
		this._writable.update((s) => {
			const next = { ...s, ...values };
			this._state = next;
			return next;
		});
	}

	private _patch_form<K extends keyof State['forms']>(key: K, sessionId: bigint, value: any) {
		const sid = sessionId.toString();
		this._writable.update((s) => ({
			...s,
			forms: {
				...s.forms,
				[key]: { ...s.forms[key], [sid]: value }
			}
		}));
	}

	private _anon_id(sessionId: bigint): string {
		const acc = get(this._writable).account.toLowerCase();
		const seed = `${acc}-${sessionId.toString()}`;
		// keccak keeps it deterministic per account+session without Buffer polyfill
		return keccak256(toUtf8Bytes(seed));
	}

	private _use_anon(sessionId: bigint): boolean {
		const state = get(this._writable);
		return state.forms.anonymous[sessionId.toString()] ?? false;
	}

	private _set_status(msg: string) {
		this._patch({ status: msg });
	}

	private _record_purchase(sessionId: bigint, weight: bigint) {
		const account = get(this._writable).account;
		if (!account) return;
		this._writable.update((s) => {
			const accKey = account.toLowerCase();
			const sessionKey = sessionId.toString();
			const prev = s.purchases[accKey]?.[sessionKey] ?? 0n;
			const next = {
				...s,
				purchases: {
					...s.purchases,
					[accKey]: { ...(s.purchases[accKey] ?? {}), [sessionKey]: prev + weight }
				}
			};
			this._state = next;
			return next;
		});
	}

	private _status_from_error(err: any, fallback: string): string {
		if (err?.code === 4001) return 'User rejected the transaction in MetaMask.';
		const decoded = this._decode_error(err);
		if (decoded) return decoded;
		const msg = err?.info?.error?.message ?? err?.message ?? '';
		const networkDown =
			err?.code === 'NETWORK_ERROR' ||
			err?.code === 'SERVER_ERROR' ||
			(msg &&
				(msg.includes('ECONNREFUSED') ||
					msg.includes('fetch failed') ||
					msg.includes('Failed to fetch')));
		if (networkDown) {
			return 'RPC / dev server unreachable. Is your node or Vite server running?';
		}
		const genericRevert =
			(!err?.data && !err?.reason && err?.code === 'CALL_EXCEPTION') ||
			msg.includes('missing revert data');
		if (genericRevert) {
			return 'Transaction reverted without a reason. Likely causes: weight exceeds your allowance (default 1 unless setVoterWeight/purchaseWeight), session not active, or delegation/owner rules.';
		}
		if (msg.includes('Internal JSON-RPC error')) {
			return 'Node rejected the transaction (internal error). Check weight allowance, session window, and rules, then retry.';
		}
		return msg || fallback;
	}

	private async _dry_run(
		fn: string,
		args: any[],
		fallback: string,
		overrides?: Record<string, any>
	): Promise<string | null> {
		const c = this._contract;
		if (!c?.getFunction) return null;
		try {
			const method = c.getFunction(fn) as any;
			if (!method?.staticCall) return null;
			const finalArgs = overrides ? [...args, overrides] : args;
			await method.staticCall(...finalArgs);
			return null;
		} catch (err: any) {
			console.error('dry-run failed', err);
			return this._status_from_error(err, fallback);
		}
	}

	private async _sync_owner() {
		const contract = this._contract;
		if (!contract) return;
		try {
			const owner = await contract.owner();
			const account = get(this._writable).account;
			this._patch({ ownerAddress: owner, isOwner: owner.toLowerCase() === account.toLowerCase() });
		} catch (err) {
			// ignore
		}
	}

	private _decode_error(err: any): string | null {
		const data = err?.data ?? err?.info?.error?.data ?? err?.error?.data;
		if (typeof data === 'string' && data.length >= 10) {
			const selector = data.slice(2, 10);
			if (selector === '30cd7471')
				return 'NotOwner: only contract owner can create sessions or call this action.';
			if (selector === 'f36720e0') return 'OptionsRequired: provide at least one option.';
			if (selector === 'b5e8d2d6')
				return 'OptionMismatch: option names and weights length mismatch.';
			if (selector === '392334ed') return 'InvalidWindow: check start/end/reveal times.';
			if (selector === '702c5cc6')
				return 'InvalidAlgorithm: choose OnePersonOneVote (0) or WeightedSplit (1).';
			if (selector === 'fb1a7450')
				return 'StrategyNotSet: configure strategy for this algorithm (call setStrategy).';
		}
		return null;
	}

	private _attach_metamask_listeners(provider: BrowserProvider) {
		this.detach_listeners();
		const eth = (browser ? (globalThis as any).ethereum : null) as
			| (Eip1193Provider & {
					on?: (...args: any[]) => void;
					removeListener?: (...args: any[]) => void;
			  })
			| null;
		const handleAccounts = (accounts: string[]) => {
			if (accounts && accounts.length) {
				this._patch({ account: accounts[0], availableAccounts: accounts });
				this._rebind_metamask_contract(accounts[0]).then(() => {
					this._sync_owner();
					this.refresh_sessions();
				});
			}
		};
		const handleChain = () => {
			this._rebind_metamask_contract().then(() => {
				this._sync_owner();
				this.refresh_sessions();
			});
		};
		if (eth?.on) {
			eth.on('accountsChanged', handleAccounts);
			eth.on('chainChanged', handleChain);
			this._metamaskCleanup = () => {
				eth.removeListener?.('accountsChanged', handleAccounts);
				eth.removeListener?.('chainChanged', handleChain);
			};
		}
	}

	private async _load_session(sessionId: bigint, chainNow?: bigint): Promise<SessionView> {
		const contract = this._contract!;
		if (chainNow === undefined) {
			const latest = await contract.runner?.provider?.getBlock('latest');
			chainNow = BigInt(latest?.timestamp ?? Math.floor(Date.now() / 1000));
		}
		const meta = (await contract.getSessionMeta(sessionId)) as any;
		const [
			name,
			start,
			end,
			reveal,
			algorithm,
			allowAnonymous,
			allowMultiVoteWithEth,
			concealResults,
			revealed,
			optionCount,
			pricePerWeight,
			defaultBaseWeight
		] = meta;
		const options = await contract.getOptions(sessionId);

		let canSeeResults = false;
		let totals: readonly bigint[] | null = null;
		let winners: readonly bigint[] | null = null;
		let voterVotes: SessionView['voterVotes'] = null;
		const account = get(this._writable).account;
		if (account) {
			try {
				canSeeResults = await contract.canSeeResults(sessionId, account);
				if (canSeeResults) {
					totals = await contract.getOptionTotals(sessionId);
					winners = await contract.getWinners(sessionId);
					try {
						const voters = (await contract.listVoters(sessionId)) as string[];
						const items: SessionView['voterVotes'] = [];
						for (const v of voters) {
							const res = await contract.getVoteAllocations(sessionId, v);
							const isAnonFlag = Boolean(res[2]);
							const allocations = (res[1] as any[]).map((a) => ({
								optionId: BigInt(a.optionId ?? a[0]),
								weight: BigInt(a.weight ?? a[1])
							}));
							const used = BigInt(res[4] as any);
							const isAnon =
								isAnonFlag ||
								v === '0x0000000000000000000000000000000000000000' ||
								(allocations.length === 0 && used === 0n && allowAnonymous);
							const hideAllocations = isAnonFlag || !v;
							items.push({
								voter: isAnon ? null : v,
								allocations: hideAllocations ? [] : allocations,
								usedWeight: used
							});
						}
						voterVotes = items;
					} catch (err) {
						// ignore per-voter detail errors; still show totals
						voterVotes = null;
					}
				}
			} catch (err) {
				canSeeResults = false;
			}
		}

		let voteStatus: SessionView['voteStatus'] = null;
		let allocations: AllocationResult[] | null = null;
		let usedWeight: bigint | null = null;
		let anonymousVote = false;
		let weightAllowance: bigint | null = null;
		let myBaseWeight: bigint | null = null;
		let myPurchasedWeight: bigint | null = null;
		let myReceivedDelegatedWeight: bigint | null = null;
		let myAvailableWeight: bigint | null = null;
		let myDelegate: string | null = null;
		let myDelegators: string[] = [];
		if (account) {
			try {
				const [status, allocsRaw, anon, _anonId, used] = (await contract.getVoteAllocations(
					sessionId,
					account
				)) as [bigint, AllocationResult[], boolean, string, bigint];
				const allocs = allocsRaw ?? [];
				voteStatus = status === 1n ? 'Pending' : status === 2n ? 'Confirmed' : 'None';
				allocations = allocs.map((a: AllocationResult) => ({
					optionId: BigInt(a.optionId),
					weight: BigInt(a.weight)
				}));
				usedWeight = BigInt(used);
				anonymousVote = anon;
				weightAllowance = null; // Allowance not exposed directly
			} catch (err) {
				voteStatus = null;
			}
			try {
				const [b, p, delegate, delegated, avail, received] = (await contract.getVoterState(
					sessionId,
					account
				)) as [bigint, bigint, string, boolean, bigint, bigint];
				myBaseWeight = BigInt(b);
				myPurchasedWeight = BigInt(p);
				myAvailableWeight = BigInt(avail);
				myReceivedDelegatedWeight = BigInt(received);
				myDelegate = delegated ? delegate : null;
				try {
					myDelegators = (await contract.listDelegators(sessionId, account)) as string[];
				} catch {}
			} catch (err) {
				myBaseWeight = null;
				myPurchasedWeight = null;
				myAvailableWeight = null;
				myReceivedDelegatedWeight = null;
				myDelegate = null;
				myDelegators = [];
			}
		}

		return {
			id: sessionId,
			name,
			startTime: BigInt(start),
			endTime: BigInt(end),
			revealTime: BigInt(reveal),
			chainTimestamp: chainNow,
			algorithm: Number(algorithm),
			allowAnonymous,
			allowMultiVoteWithEth,
			concealResults,
			revealed,
			isActive: chainNow >= BigInt(start) && chainNow < BigInt(end),
			optionCount: BigInt(optionCount),
			pricePerWeight: BigInt(pricePerWeight),
			defaultBaseWeight: BigInt(defaultBaseWeight ?? 1),
			options,
			canSeeResults,
			totals,
			winners,
			voterVotes,
			voteStatus,
			usedWeight,
			allocations,
			anonymousVote,
			weightAllowance,
			myBaseWeight,
			myPurchasedWeight,
			myReceivedDelegatedWeight,
			myAvailableWeight,
			myDelegate,
			myDelegators
		};
	}
}

export const voting_app = VotingApp.get_instance();
export const algorithmLabel = (alg: number) => voting_app.algorithm_label(alg);
