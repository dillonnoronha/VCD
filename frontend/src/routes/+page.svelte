<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { voting_app as app, algorithmLabel } from '$lib/votingApp';

	const shorten = (addr: string) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '');
	const fmtDate = (seconds: bigint) => {
		if (!seconds) return 'N/A';
		const ms = Number(seconds) * 1000;
		return Number.isFinite(ms) ? new Date(ms).toLocaleString() : '∞';
	};
	const timingRows = [
		{ key: 'startOffsetSec', label: 'Starts in (sec)' },
		{ key: 'endOffsetSec', label: 'Ends in (sec)' },
		{ key: 'revealOffsetSec', label: 'Reveal in (sec)' }
	] as const;

	const purchasedWeight = (sessionId: bigint) => {
		const acc = ($app.account || '').toLowerCase();
		return ($app.purchases?.[acc]?.[sessionId.toString()] ?? 0n) as bigint;
	};

	const chainNow = (session: any) =>
		(session && session.chainTimestamp) ?? BigInt(Math.floor(Date.now() / 1000));
	const pastEnd = (session: any) => chainNow(session) >= session.endTime;
	const pastReveal = (session: any) => chainNow(session) >= session.revealTime;
	const showReveal = (session: any) =>
		session.concealResults && !session.revealed && !session.canSeeResults;

	const safeBigInt = (value: string | undefined | null): bigint | null => {
		if (!value) return null;
		const v = value.trim();
		if (!/^-?\d+$/.test(v)) return null;
		try {
			return BigInt(v);
		} catch {
			return null;
		}
	};

	onMount(() => {
		app.bootstrap();
	});

	onDestroy(() => {
		app.destroy();
	});
</script>

<svelte:window on:beforeunload={app.detach_listeners} />

<div class="min-h-screen bg-slate-950 text-slate-100">
	<div class="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
		<header class="space-y-2">
			<p class="text-xs uppercase tracking-[0.25em] text-emerald-300">Voting Diamond</p>
			<h1 class="text-3xl font-semibold tracking-tight">On-chain Voting Hub</h1>
			<p class="text-sm text-slate-300 max-w-3xl">
				Connect to your deployed VotingDiamond contract, inspect sessions, and cast votes from
				MetaMask or a local node.
			</p>
		</header>

		<section
			class="space-y-4 rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-6 shadow-lg shadow-emerald-900/30"
		>
			<div class="grid gap-4 md:grid-cols-[1.3fr_1fr] md:items-end">
				<label class="flex flex-col gap-2 text-sm text-slate-200">
					<span class="text-xs uppercase tracking-wide text-slate-400">Contract address</span>
					<input
						class="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
						placeholder="0x..."
						title="Paste the deployed VotingDiamond address (42 chars)"
						value={$app.contractAddress}
						on:input={(e) => app.set_contract_address((e.target as HTMLInputElement).value)}
						spellcheck={false}
						autocomplete="off"
					/>
				</label>

				<div class="flex flex-wrap gap-3">
					<button
						class="h-11 rounded-full bg-emerald-500 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
						title="Connect to MetaMask and pick the active account"
						on:click={app.connect_metamask}
						disabled={$app.connecting}
					>
						{$app.metamaskAvailable ? 'Connect MetaMask' : 'MetaMask Unavailable'}
					</button>
					<button
						class="h-11 rounded-full border border-emerald-400/60 px-4 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/10 disabled:opacity-60 disabled:cursor-not-allowed"
						title="Use HTTP RPC (e.g., localhost or remote node) with the first account"
						on:click={app.connect_local}
						disabled={$app.connecting}
					>
						Connect Local
					</button>
				</div>
			</div>

			<div class="grid gap-4 md:grid-cols-[1.1fr_1fr] md:items-end">
				<label class="flex flex-col gap-2 text-sm text-slate-200">
					<span class="text-xs uppercase tracking-wide text-slate-400">RPC URL (local)</span>
					<input
						class="h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
						title="HTTP provider URL used for the Local connection"
						value={$app.rpcUrl}
						on:input={(e) => app.set_rpc_url((e.target as HTMLInputElement).value)}
					/>
				</label>

				<div class="flex flex-wrap gap-3">
					<button
						class="h-10 rounded-full border border-slate-700 px-4 text-xs font-semibold text-slate-200 transition hover:border-emerald-400 hover:text-emerald-100 disabled:opacity-60"
						title="Pull latest sessions and on-chain data"
						on:click={app.refresh_sessions}
						disabled={!$app.account || $app.loadingSessions}
					>
						{$app.loadingSessions ? 'Refreshing...' : 'Refresh Sessions'}
					</button>
					{#if $app.providerSource === 'local'}
						<button
							class="h-10 rounded-full border border-amber-400/70 px-4 text-xs font-semibold text-amber-200 transition hover:border-amber-300 hover:text-amber-100 disabled:opacity-60"
							title="Mine one block to advance chain time (dev local only)"
							on:click={() => app.bump_block()}
						>
							Mine 1 block
						</button>
					{/if}
				</div>
			</div>

			<div class="grid gap-3 md:grid-cols-3 text-xs text-slate-300">
				<div class="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1">
					<p class="uppercase tracking-wide text-[11px] text-slate-500">Status</p>
					<p class="text-slate-100">{$app.status}</p>
					{#if $app.ownerAddress}
						<p class="text-[11px] text-slate-500">
							Owner: {shorten($app.ownerAddress)}
							{#if $app.isOwner}(you){/if}
						</p>
					{/if}
				</div>
				<div class="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1">
					<p class="uppercase tracking-wide text-[11px] text-slate-500">Account</p>
					<p class="font-mono text-xs text-slate-100">{$app.account || '—'}</p>
					{#if $app.networkId !== null}
						<p class="text-[11px] text-slate-400">Network ID: {$app.networkId}</p>
					{/if}
				</div>
				<div class="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-1">
					<p class="uppercase tracking-wide text-[11px] text-slate-500">Connection</p>
					<p class="text-slate-100">{$app.providerSource ?? 'Not connected'}</p>
					<p class="text-[11px] text-slate-500">Accounts loaded: {$app.availableAccounts.length}</p>
				</div>
			</div>
		</section>

		{#if $app.account}
			<section class="space-y-4">
				<div class="flex items-baseline justify-between">
					<h2 class="text-2xl font-semibold text-emerald-200">Voting Sessions</h2>
					<span class="text-xs uppercase tracking-wide text-slate-500"
						>{$app.sessions.length} total</span
					>
				</div>

				{#if !$app.sessions.length}
					<p
						class="rounded-xl border border-dashed border-emerald-500/30 bg-slate-900/50 p-6 text-sm text-slate-300"
					>
						No sessions found. Refresh after your contract has sessions.
					</p>
				{:else}
					<div class="mb-3 flex items-center gap-3 text-sm">
						<label class="flex items-center gap-2 text-slate-300">
							<input
								type="checkbox"
								checked={$app.hideRevealed ?? false}
								on:change={(e) => app.set_hide_revealed((e.target as HTMLInputElement).checked)}
								class="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400"
							/>
							<span>Hide revealed sessions</span>
						</label>
						<label class="flex items-center gap-2 text-slate-300">
							<input
								type="checkbox"
								checked={$app.hideFinished ?? false}
								on:change={(e) => app.set_hide_finished((e.target as HTMLInputElement).checked)}
								class="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400"
							/>
							<span>Hide finished sessions</span>
						</label>
					</div>
					<div class="grid gap-4 md:grid-cols-2">
						{#each $app.sessions as session}
							{#if ($app.hideRevealed && (session.revealed || session.revealTime <= BigInt(Math.floor(Date.now() / 1000)))) || ($app.hideFinished && session.endTime <= BigInt(Math.floor(Date.now() / 1000)))}
								<!-- hidden -->
							{:else}
								<article
									class="space-y-4 rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-5 shadow-lg shadow-emerald-900/30"
								>
									<div class="flex items-start justify-between gap-3">
										<div>
											<p class="text-xs uppercase tracking-wide text-slate-500">
												Session #{session.id.toString()}
											</p>
											<h3 class="text-lg font-semibold text-emerald-200">
												{session.name || 'Untitled'}
											</h3>
											<p class="text-[11px] text-slate-400">
												Algo: {algorithmLabel(session.algorithm)}
											</p>
										</div>
										<button
											class="rounded-md border border-slate-700 px-3 py-1 text-[11px] text-slate-200 transition hover:border-emerald-400"
											title="Refresh only this session"
											on:click={() => app.refresh_single(session.id)}
											disabled={$app.actionSessionId === session.id}
										>
											{$app.actionSessionId === session.id ? 'Refreshing…' : 'Refresh'}
										</button>
									</div>

									<div class="grid grid-cols-2 gap-3 text-xs text-slate-300">
										<div class="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
											<p class="text-[11px] uppercase tracking-wide text-slate-500">Start</p>
											<p>{fmtDate(session.startTime)}</p>
										</div>
										<div class="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
											<p class="text-[11px] uppercase tracking-wide text-slate-500">End</p>
											<p>{fmtDate(session.endTime)}</p>
										</div>
										<div class="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
											<p class="text-[11px] uppercase tracking-wide text-slate-500">Reveal</p>
											<p>{fmtDate(session.revealTime)}</p>
										</div>
										<div class="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
											<p class="text-[11px] uppercase tracking-wide text-slate-500">
												Price / weight
											</p>
											<p>{app.format_price(session.pricePerWeight)}</p>
										</div>
									</div>

									<div class="space-y-2">
										<p class="text-xs uppercase tracking-wide text-slate-500">Options</p>
										<div class="flex flex-wrap gap-2">
											{#each session.options as opt, idx}
												{@const myAlloc = session.allocations?.find(
													(a) => a.optionId === BigInt(idx)
												)}
												<div
													class={`rounded-md border px-3 py-2 text-xs ${
														myAlloc
															? 'border-emerald-500/60 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(16,185,129,0.25)]'
															: 'border-slate-800 bg-slate-950/70'
													}`}
												>
													<p class="font-semibold text-emerald-100 flex items-center gap-2">
														<span>{idx}: {opt.name}</span>
														{#if myAlloc}
															<span
																class="rounded-full bg-emerald-500/20 px-2 py-[2px] text-[10px] font-semibold text-emerald-100"
															>
																You: {myAlloc.weight.toString()}
															</span>
														{/if}
													</p>
													<p class="text-[11px] text-slate-400">Weight: {opt.weight.toString()}</p>
												</div>
											{/each}
										</div>
									</div>

									{#if session.canSeeResults && session.totals}
										<div
											class="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs"
										>
											<p class="uppercase tracking-wide text-[11px] text-emerald-200">Totals</p>
											<div class="grid grid-cols-2 gap-2">
												{#each session.totals as total, idx}
													<div
														class="flex items-center justify-between rounded border border-emerald-500/30 bg-slate-950/70 px-2 py-1"
													>
														<span class="text-slate-200">Option {idx}</span>
														<span class="font-mono text-emerald-100">{total.toString()}</span>
													</div>
												{/each}
											</div>
											{#if session.winners}
												<p class="text-[11px] text-emerald-200">
													Winners: {session.winners.map((w) => w.toString()).join(', ')}
												</p>
											{/if}
											{#if session.voterVotes}
												<div
													class="mt-2 space-y-1"
													class:max-h-48={session.voterVotes.length > 3}
													class:overflow-y-auto={session.voterVotes.length > 3}
													class:pr-1={session.voterVotes.length > 3}
												>
													<p class="text-[11px] uppercase tracking-wide text-emerald-200">Voters</p>
													{#each session.voterVotes as vv, i}
														<div class="rounded border border-emerald-500/20 bg-slate-950/60 px-2 py-1">
															<p class="text-[11px] text-slate-200 font-mono">
																{vv.voter ? vv.voter : 'Anonymous'} {#if vv.voter === $app.account}(you){/if}
															</p>
															{#if vv.allocations.length && vv.voter}
																<ul class="text-[11px] text-slate-300 list-disc pl-4">
																	{#each vv.allocations as a}
																		<li>Opt {a.optionId.toString()} → {a.weight.toString()}</li>
																	{/each}
																</ul>
															{:else}
																<p class="text-[11px] text-slate-500">Allocations hidden (anonymous).</p>
															{/if}
														</div>
													{/each}
												</div>
											{/if}
										</div>
									{:else}
										<p
											class="rounded-md border border-dashed border-slate-700 bg-slate-950/50 p-3 text-[11px] text-slate-400"
										>
											Results are concealed or you are not authorized.
										</p>
									{/if}

									{#if session.endTime > BigInt(Math.floor(Date.now() / 1000))}
										<div
											class="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm"
										>
											<p class="text-xs uppercase tracking-wide text-slate-500">Vote</p>
											<div
												class="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end"
											>
												<label class="flex flex-col gap-1">
													<span class="text-[11px] uppercase tracking-wide text-slate-500"
														>Option</span
													>
													<input
														class="h-9 w-full min-w-0 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
														placeholder="0"
														title="Option index to vote for"
														value={$app.forms.voteOption[session.id.toString()] ?? ''}
														on:input={(e) =>
															app.set_vote_option(session.id, (e.target as HTMLInputElement).value)}
													/>
												</label>
												<label class="flex flex-col gap-1">
													<span class="text-[11px] uppercase tracking-wide text-slate-500"
														>Weight</span
													>
													<input
														class="h-9 w-full min-w-0 rounded-md border border-slate-700 bg-slate-900 px-3 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
														placeholder="1"
														title="Vote weight to use (must be ≤ your allowance)"
														value={$app.forms.voteWeight[session.id.toString()] ?? ''}
														on:input={(e) =>
															app.set_vote_weight(session.id, (e.target as HTMLInputElement).value)}
													/>
												</label>
												<div class="md:col-span-2 overflow-x-auto">
													<!-- Removed ml-auto, added items-center, ensured all buttons are h-9 -->
													<div class="flex flex-nowrap items-center gap-2 text-[12px]">
														{#if session.voteStatus === 'Confirmed' || session.voteStatus === 'Pending'}
															<button
																class="whitespace-nowrap h-9 rounded-md border border-amber-400/60 px-4 text-[12px] font-semibold text-amber-200 transition hover:bg-amber-400/10 disabled:opacity-60"
																title="You already voted; update overrides your previous allocations"
																on:click={() => app.update_vote(session.id)}
																disabled={$app.updatingSessionId === session.id}
															>
																{$app.updatingSessionId === session.id ? 'Updating...' : 'Update'}
															</button>
														{:else}
															<button
																class="whitespace-nowrap h-9 rounded-md bg-emerald-500 px-4 text-[12px] font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
																title="Submit a new vote"
																on:click={() => app.cast_vote(session.id)}
																disabled={$app.castingSessionId === session.id}
															>
																{$app.castingSessionId === session.id ? 'Casting...' : 'Cast'}
															</button>
														{/if}
														<!-- Changed py-2 to h-9 for alignment -->
														{#if session.voteStatus === 'Pending'}
															<button
																class="whitespace-nowrap h-9 rounded-md border border-slate-700 px-3 text-slate-200 transition hover:border-emerald-400 disabled:opacity-60"
																title="Confirm your pending vote"
																on:click={() => app.confirm_vote(session.id)}
																disabled={$app.actionSessionId === session.id}
															>
																Confirm pending
															</button>
														{/if}
														{#if session.voteStatus === 'Pending' || session.voteStatus === 'Confirmed'}
															<button
																class="whitespace-nowrap h-9 rounded-md border border-rose-500/60 px-3 text-rose-100 transition hover:bg-rose-500/10 disabled:opacity-60"
																title="Withdraw your vote"
																on:click={() => app.revoke_vote(session.id)}
																disabled={$app.actionSessionId === session.id}
															>
																Revoke
															</button>
														{/if}
														
														
														{#if !(session.voteStatus === 'Confirmed' || session.voteStatus === 'Pending')}
															{#if $app.forms.finalize[session.id.toString()] ?? true}
																<button
																	class="whitespace-nowrap h-9 rounded-md bg-red-500 px-3 text-slate-950 font-semibold transition hover:bg-red-400 disabled:opacity-60"
																	title="Currently finalizing: vote is sent immediately. Click to switch to pending."
																	on:click={() => app.set_finalize(session.id, false)}
																>
																	Instant
																</button>
															{:else}
																<button
																	class="whitespace-nowrap h-9 rounded-md border border-slate-400/70 px-3 text-slate-100 font-semibold transition hover:bg-slate-400/10 disabled:opacity-60"
																	title="Currently pending: vote will need confirmation later. Click to finalize immediately."
																	on:click={() => app.set_finalize(session.id, true)}
																>
																	Prepare
																</button>
															{/if}
														{/if}

														{#if session.allowAnonymous}
															{#if $app.forms.anonymous[session.id.toString()] ?? true}
																<button
																	class="whitespace-nowrap h-9 rounded-md bg-blue-500 px-3 text-slate-950 font-semibold transition hover:bg-blue-400 disabled:opacity-60"
																	title="Currently voting anonymously. Click to show your address in results."
																	on:click={() => app.set_anonymous(session.id, false)}
																>
																	Anonymous
																</button>
															{:else}
																<button
																	class="whitespace-nowrap h-9 rounded-md border border-slate-400/70 px-3 text-slate-100 font-semibold transition hover:bg-slate-400/10 disabled:opacity-60"
																	title="Currently showing your address in results. Click to vote anonymously."
																	on:click={() => app.set_anonymous(session.id, true)}
																>
																	Visible
																</button>
															{/if}
														{/if}
													</div>
												</div>
											</div>

											<!--
									{#if $app.account}
										<div class="rounded-md border border-slate-800 bg-slate-950/80 px-3 py-2 text-[11px] text-slate-300 space-y-1">
											<p class="text-[10px] uppercase tracking-wide text-slate-500">Weight helper</p>
											{#if safeBigInt($app.forms.voteWeight[session.id.toString()]) !== null}
												<p>Requested: {safeBigInt($app.forms.voteWeight[session.id.toString()])?.toString()}</p>
											{:else}
												<p>Requested: —</p>
											{/if}
												<p>Base (account): {(session.myBaseWeight ?? session.defaultBaseWeight).toString()}</p>
												<p>Delegated to you: {(session.myReceivedDelegatedWeight ?? 0n).toString()}</p>
												<p>Purchased (on-chain): {(session.myPurchasedWeight ?? purchasedWeight(session.id)).toString()}</p>
												<p>Allowance est.: {(session.myAvailableWeight ?? (session.defaultBaseWeight + purchasedWeight(session.id))).toString()}</p>
												{#if safeBigInt($app.forms.voteWeight[session.id.toString()]) !== null && safeBigInt($app.forms.voteWeight[session.id.toString()])! > (session.myAvailableWeight ?? (session.defaultBaseWeight + purchasedWeight(session.id))) }
												<p class="text-amber-300">Warning: requested &gt; estimated allowance; tx will revert.</p>
											{/if}
											{#if session.algorithm === 1 && safeBigInt($app.forms.voteWeight[session.id.toString()]) !== null}
												<p>WeightedSplit: effective = requested × option weight.</p>
											{/if}
										</div>
									{/if}

									<div class="flex flex-wrap gap-2 text-[12px]">
									</div>
									-->

											<div class="grid gap-3 md:grid-cols-2">
												<div
													class="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm space-y-3"
												>
													<p class="text-xs uppercase tracking-wide text-slate-500">Delegate</p>
													<div class="flex gap-2">
														<input
															class="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 font-mono text-[12px] text-slate-100 focus:border-emerald-400 focus:outline-none"
															placeholder="0x delegate"
															title="Send your full session weight to this address; they will vote on your behalf."
															value={$app.forms.delegateTo[session.id.toString()] ?? ''}
															on:input={(e) =>
																app.set_delegate_to(
																	session.id,
																	(e.target as HTMLInputElement).value
																)}
														/>
														<button
															class="h-10 rounded-md bg-slate-800 px-4 text-[12px] font-semibold text-slate-100 transition hover:border-emerald-400 hover:bg-slate-700 disabled:opacity-60"
															title="Delegate your weight (no cost; blocks self/loop delegation). Delegate votes instead of you."
															on:click={() => app.delegate_vote(session.id)}
															disabled={$app.delegatingSessionId === session.id}
														>
															{$app.delegatingSessionId === session.id
																? 'Delegating...'
																: 'Delegate'}
														</button>
													</div>
												</div>

												<div
													class="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm space-y-3"
												>
													<p class="text-xs uppercase tracking-wide text-slate-500">
														Purchase Weight
													</p>
													<div class="flex gap-2">
														<input
															class="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-[12px] text-slate-100 focus:border-emerald-400 focus:outline-none"
															placeholder="0.01"
															title="ETH amount to buy extra weight (uses pricePerWeight)"
															value={$app.forms.purchaseEth[session.id.toString()] ?? ''}
															on:input={(e) =>
																app.set_purchase_eth(
																	session.id,
																	(e.target as HTMLInputElement).value
																)}
														/>
														<button
															class="h-10 rounded-md bg-emerald-500 px-4 text-[12px] font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60"
															title="Send ETH to purchase additional weight"
															on:click={() => app.purchase_weight(session.id)}
															disabled={$app.purchasingSessionId === session.id}
														>
															{$app.purchasingSessionId === session.id
																? 'Purchasing...'
																: 'Purchase'}
														</button>
													</div>
												</div>
											</div>

											{#if $app.isOwner && session.isActive}
												<div class="flex flex-wrap gap-2 text-[12px]">
													{#if showReveal(session)}
														<button
															class="rounded-md border border-emerald-400/60 px-3 py-2 text-emerald-200 transition hover:bg-emerald-400/10 disabled:opacity-60 w-auto"
															title="Reveal results (requires authorization or time reached; does not end the session)"
															on:click={() => app.reveal_results(session.id)}
															disabled={$app.revealingSessionId === session.id}
														>
															{$app.revealingSessionId === session.id ? 'Revealing...' : 'Reveal'}
														</button>
													{/if}
													<button
														class="rounded-md border border-slate-700 px-3 py-2 text-slate-200 transition hover:border-emerald-400 disabled:opacity-60 w-auto"
														title="Force end the session immediately (owner only); does NOT reveal results"
														on:click={() => app.force_end_session(session.id)}
														disabled={$app.actionSessionId === session.id}
													>
														End Session Now
													</button>
												</div>
											{/if}
										</div>
									{:else if $app.isOwner}
										{#if showReveal(session)}
											<div class="flex flex-wrap gap-2 text-[12px] mt-2">
												<button
													class="rounded-md border border-emerald-400/60 px-3 py-2 text-emerald-200 transition hover:bg-emerald-400/10 disabled:opacity-60"
													title="Reveal results (does not end session; requires authorization or time reached)"
													on:click={() => app.reveal_results(session.id)}
													disabled={$app.revealingSessionId === session.id}
												>
													{$app.revealingSessionId === session.id ? 'Revealing...' : 'Reveal'}
												</button>
											</div>
										{/if}
									{/if}

									{#if session.myDelegate || session.myDelegators.length}
										<div
											class="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-[12px] text-slate-200 space-y-2"
										>
											<p class="uppercase tracking-wide text-[11px] text-slate-500">Delegation</p>
											{#if session.myDelegate}
												<p>
													Delegated to: <span class="font-mono text-yellow-200"
														>{session.myDelegate}</span
													>
												</p>
											{/if}
											{#if session.myDelegators.length}
												<div class="space-y-1">
													<p>Delegators to you:</p>
													<div
														class="max-h-20 overflow-y-auto rounded border border-slate-800/80 bg-slate-900/70 p-2 space-y-1"
													>
														{#each session.myDelegators as d}
															<p class="font-mono text-[11px] text-amber-200">{d}</p>
														{/each}
													</div>
												</div>
											{/if}
										</div>
									{/if}

									{#if $app.account}
										<div class="overflow-x-auto pb-2">
											<div class="flex gap-3 min-w-max">
												{#if safeBigInt($app.forms.voteWeight[session.id.toString()]) !== null && safeBigInt($app.forms.voteWeight[session.id.toString()])! > (session.myAvailableWeight ?? session.defaultBaseWeight + purchasedWeight(session.id))}
													<div
														class="min-w-[140px] rounded-lg border border-rose-500 bg-rose-500/10 p-3 text-[11px] text-rose-300"
													>
														<p class="text-[10px] uppercase tracking-wide text-rose-400">Warning</p>
														<p>Requested &gt; estimated allowance; tx will revert.</p>
													</div>
												{/if}
												<div
													class="min-w-[140px] rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-[11px] text-slate-200"
												>
													<p class="text-[10px] uppercase tracking-wide text-slate-500">Status</p>
													<p class="font-semibold text-emerald-200">{session.voteStatus ?? '—'}</p>
												</div>
												<div
													class="min-w-[140px] rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-[11px] text-slate-200"
												>
													<p class="text-[10px] uppercase tracking-wide text-slate-500">
														Used weight
													</p>
													<p>{session.usedWeight !== null ? session.usedWeight.toString() : '—'}</p>
												</div>
												<div
													class="min-w-[140px] rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-[11px] text-slate-200"
												>
													<p class="text-[10px] uppercase tracking-wide text-slate-500">Base</p>
													<p>{(session.myBaseWeight ?? session.defaultBaseWeight).toString()}</p>
												</div>
												<div
													class="min-w-[140px] rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-[11px] text-slate-200"
												>
													<p class="text-[10px] uppercase tracking-wide text-slate-500">
														Delegated to you
													</p>
													<p>{(session.myReceivedDelegatedWeight ?? 0n).toString()}</p>
												</div>
												<div
													class="min-w-[140px] rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-[11px] text-slate-200"
												>
													<p class="text-[10px] uppercase tracking-wide text-slate-500">
														Purchased
													</p>
													<p>
														{(session.myPurchasedWeight ?? purchasedWeight(session.id)).toString()}
													</p>
												</div>
												<div
													class="min-w-[160px] rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-[11px] text-slate-200"
												>
													<p class="text-[10px] uppercase tracking-wide text-slate-500">
														Allowance est.
													</p>
													<p>
														{(
															session.myAvailableWeight ??
															session.defaultBaseWeight + purchasedWeight(session.id)
														).toString()}
													</p>
												</div>
												<div
													class="min-w-[140px] rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-[11px] text-slate-200"
												>
													<p class="text-[10px] uppercase tracking-wide text-slate-500">
														Anonymous
													</p>
													<p>{session.anonymousVote ? 'Yes' : 'No'}</p>
												</div>
											</div>
										</div>
									{/if}
								</article>
							{/if}
						{/each}
					</div>
				{/if}
			</section>

			{#if $app.isOwner}
				<section
					class="rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-6 shadow-lg shadow-emerald-900/30 space-y-4"
				>
					<div class="flex items-baseline justify-between">
						<div>
							<p class="text-xs uppercase tracking-wide text-emerald-300">Admin</p>
							<h2 class="text-xl font-semibold text-slate-100">Create Voting Session</h2>
							{#if $app.ownerAddress}
								<p class="text-[11px] text-slate-400">
									Contract owner: {$app.ownerAddress}{#if !$app.isOwner}
										(not you){/if}
								</p>
							{/if}
						</div>
						<button
							class="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed"
							title="Owner-only: create a new session with the settings below"
							on:click={app.create_session}
							disabled={$app.actionSessionId === -1n || !$app.isOwner}
						>
							{$app.isOwner
								? $app.actionSessionId === -1n
									? 'Creating...'
									: 'Create Session'
								: 'Owner only'}
						</button>
					</div>

					<div class="grid gap-4 md:grid-cols-2">
						<label class="flex flex-col gap-1 text-sm text-slate-200">
							<span class="text-[11px] uppercase tracking-wide text-slate-500">Name</span>
							<input
								class="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
								placeholder="Community Vote"
								title="Session title shown in the list"
								value={$app.forms.create.name}
								on:input={(e) => app.set_create_field('name', (e.target as HTMLInputElement).value)}
							/>
						</label>

						<label class="flex flex-col gap-1 text-sm text-slate-200">
							<span class="text-[11px] uppercase tracking-wide text-slate-500"
								>Price per weight (ETH)</span
							>
							<input
								class="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
								title="Price in ETH per weight unit"
								value={$app.forms.create.pricePerWeightEth}
								on:input={(e) =>
									app.set_create_field('pricePerWeightEth', (e.target as HTMLInputElement).value)}
							/>
						</label>
						<label class="flex flex-col gap-1 text-sm text-slate-200">
							<span class="text-[11px] uppercase tracking-wide text-slate-500"
								>Default base weight per voter</span
							>
							<input
								class="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
								title="Initial weight given to each voter (can still be raised with purchases or setVoterWeight)"
								value={$app.forms.create.defaultBaseWeight}
								on:input={(e) =>
									app.set_create_field('defaultBaseWeight', (e.target as HTMLInputElement).value)}
							/>
						</label>
					</div>

					<div class="grid gap-4 md:grid-cols-3 text-sm">
						{#each timingRows as row}
							<label class="flex flex-col gap-1">
								<span class="text-[11px] uppercase tracking-wide text-slate-500">{row.label}</span>
								<input
									class="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
									type="number"
									min="0"
									title="Seconds from now until this phase"
									value={$app.forms.create[row.key]}
									on:input={(e) =>
										app.set_create_field(row.key, (e.target as HTMLInputElement).value)}
								/>
							</label>
						{/each}
					</div>

					<div class="grid gap-4 md:grid-cols-2 text-sm">
						<label class="flex flex-col gap-1">
							<span class="text-[11px] uppercase tracking-wide text-slate-500">Algorithm</span>
							<select
								class="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
								title="Choose the voting algorithm"
								value={$app.forms.create.algorithm}
								on:change={(e) =>
									app.set_create_field('algorithm', (e.target as HTMLSelectElement).value)}
							>
								<option value="0">OnePersonOneVote (0)</option>
								<option value="1">WeightedSplit (1)</option>
							</select>
						</label>

						<label class="flex flex-col gap-1">
							<span class="text-[11px] uppercase tracking-wide text-slate-500"
								>Authorized viewers (comma-separated)</span
							>
							<input
								class="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
								placeholder="0xabc...,0xdef..."
								title="Comma-separated addresses allowed to view concealed results"
								value={$app.forms.create.authorizedViewers}
								on:input={(e) =>
									app.set_create_field('authorizedViewers', (e.target as HTMLInputElement).value)}
							/>
						</label>
					</div>

					<div class="flex flex-wrap gap-4 text-xs">
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								checked={$app.forms.create.allowAnonymous}
								on:change={(e) =>
									app.set_create_field('allowAnonymous', (e.target as HTMLInputElement).checked)}
								class="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400"
							/>
							<span>Allow anonymous</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								checked={$app.forms.create.allowMultiVoteWithEth}
								on:change={(e) =>
									app.set_create_field(
										'allowMultiVoteWithEth',
										(e.target as HTMLInputElement).checked
									)}
								class="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400"
							/>
							<span>Allow multi-vote with ETH</span>
						</label>
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								checked={$app.forms.create.concealResults}
								on:change={(e) =>
									app.set_create_field('concealResults', (e.target as HTMLInputElement).checked)}
								class="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-400"
							/>
							<span>Conceal results until reveal</span>
						</label>
					</div>

					<div class="space-y-2">
						<div class="flex items-center justify-between">
							<p class="text-xs uppercase tracking-wide text-slate-500">Options</p>
							<div class="flex gap-2">
								<button
									class="rounded-md border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover:border-emerald-400"
									title="Add another option"
									on:click={app.add_create_option}>Add</button
								>
								<button
									class="rounded-md border border-slate-700 px-3 py-1 text-[11px] text-slate-200 hover-border-rose-400"
									title="Remove the last option"
									on:click={() => app.remove_create_option($app.forms.create.options.length - 1)}
									disabled={$app.forms.create.options.length <= 1}>Remove last</button
								>
							</div>
						</div>
						<div class="grid gap-3 md:grid-cols-2">
							{#each $app.forms.create.options as opt, idx}
								<div class="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2">
									<p class="text-[11px] uppercase tracking-wide text-slate-500">Option {idx}</p>
									<input
										class="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
										title="Option label"
										value={opt.name}
										on:input={(e) =>
											app.update_create_option(idx, 'name', (e.target as HTMLInputElement).value)}
									/>
									<input
										class="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
										type="number"
										min="1"
										title="Relative weight for this option"
										value={opt.weight}
										on:input={(e) =>
											app.update_create_option(idx, 'weight', (e.target as HTMLInputElement).value)}
									/>
								</div>
							{/each}
						</div>
					</div>
				</section>
			{/if}
		{:else}
			<section
				class="rounded-2xl border border-dashed border-emerald-500/30 bg-slate-900/50 p-6 text-sm text-slate-300"
			>
				<p>Connect with MetaMask or a local node to load sessions.</p>
			</section>
		{/if}
	</div>
</div>
