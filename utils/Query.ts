import fetch from 'node-fetch'
// import jwt from 'jsonwebtoken'
// import fs from 'fs'
import { TLRU } from 'tlru'
import StreamCache from 'stream-cache'
import DataLoader from 'dataloader'
import { User as DiscordUser } from 'discord.js'
import { Stream } from 'stream'

import { Bot, User, ListType, BotList } from '@types'
import { cats } from './Constants'

import knex from './Knex'
import DiscordBot from './DiscordBot'

export const imageRateLimit = new TLRU<unknown, number>({ maxAgeMs: 60000 })

// const publicPem = fs.readFileSync('./public.pem')
// const privateKey = fs.readFileSync('./private.key')

async function getBot(id: string, owners=true) {
	const res = await knex('bots')
		.select([
			'id',
			'owners',
			'lib',
			'prefix',
			'votes',
			'servers',
			'intro',
			'desc',
			'web',
			'git',
			'url',
			'category',
			'status',
			'name',
			'avatar',
			'tag',
			'verified',
			'trusted',
			'partnered',
			'discord',
			'boosted',
			'state',
			'vanity',
			'bg',
			'banner',
		])
		.where({ id })
		.orWhere({ vanity: id, trusted: true })
		.orWhere({ vanity: id, partnered: true })
	if (res[0]) {
		res[0].category = JSON.parse(res[0].category)
		res[0].owners = JSON.parse(res[0].owners)
		res[0].vanity = ((res[0].trusted || res[0].partnered) && res[0].vanity) ?? null
		if (owners)
			res[0].owners = await Promise.all(
				res[0].owners.map(async (u: string) => await get._rawUser.load(u))
			)
		res[0].owners = res[0].owners.filter((el: User | null) => el).map((row: User) => ({ ...row }))
	}

	return res[0] ?? null
}

async function getUser(id: string, bots = true) {
	const res = await knex('users')
		.select(['id', 'avatar', 'tag', 'username', 'perm', 'github'])
		.where({ id })
	if (res[0]) {
		const owned = await knex('bots')
			.select(['id'])
			.where('owners', 'like', `%${id}%`)
		if (bots) res[0].bots = await Promise.all(owned.map(async b => await get._rawBot.load(b.id)))
		else res[0].bots = owned.map(async b => b.id)
		res[0].bots = res[0].bots.filter((el: Bot | null) => el).map((row: User) => ({ ...row }))
	}

	return res[0] || null
}

async function getBotList(type: ListType, page = 1, query?: string):Promise<BotList> {
	let res: { id: string }[]
	let count:string|number
	if (type === 'VOTE') {
		count = (await knex('bots').count())[0]['count(*)']
		res = await knex('bots')
			.orderBy('votes', 'desc')
			.orderBy('servers', 'desc')
			.limit(16)
			.offset(((page ? Number(page) : 1) - 1) * 16)
			.select(['id'])
	} else if (type === 'TRUSTED') {
		count = (
			await knex('bots')
				.where({ trusted: true })
				.count()
		)[0]['count(*)']
		res = await knex('bots')
			.where({ trusted: true })
			.orderByRaw('RAND()')
			.limit(16)
			.offset(((page ? Number(page) : 1) - 1) * 16)
			.select(['id'])
	} else if (type === 'NEW') {
		count = (
			await knex('bots')
				.count()
		)[0]['count(*)']
		res = await knex('bots')
			.orderBy('date', 'desc')
			.limit(16)
			.offset(((page ? Number(page) : 1) - 1) * 16)
			.select(['id'])
	} else if (type === 'PARTNERED') {
		count = (
			await knex('bots')
				.where({ partnered: true })
				.count()
		)[0]['count(*)']
		res = await knex('bots')
			.where({ partnered: true })
			.orderByRaw('RAND()')
			.limit(16)
			.offset(((page ? Number(page) : 1) - 1) * 16)
			.select(['id'])
	} else if (type === 'CATEGORY') {
		if (!query) throw new Error('쿼리가 누락되었습니다.')
		if (!cats.includes(query)) throw new Error('알 수 없는 카테고리입니다.')
		count = (
			await knex('bots')
				.where('category', 'like', `%${decodeURI(query)}%`)
				.count()
		)[0]['count(*)']
		res = await knex('bots')
			.where('category', 'like', `%${decodeURI(query)}%`)
			.orderBy('votes', 'desc')
			.orderBy('servers', 'desc')
			.limit(16)
			.offset(((page ? Number(page) : 1) - 1) * 16)
			.select(['id'])
	} else if (type === 'SEARCH') {
		if (!query) throw new Error('쿼리가 누락되었습니다.')
		try {
			new RegExp(query)
			count = (
				await knex('bots')
					.where('name', 'REGEXP', query)
					.orWhere('intro', 'REGEXP', query)
					.orWhere('desc', 'REGEXP', query)
					.orderBy('votes', 'desc')
					.orderBy('servers', 'desc')
					.count()
			)[0]['count(*)']

			res = await knex('bots')
				.where('name', 'REGEXP', query)
				.orWhere('intro', 'REGEXP', query)
				.orWhere('desc', 'REGEXP', query)
				.orderBy('votes', 'desc')
				.orderBy('servers', 'desc')
				.limit(16)
				.offset(((page ? Number(page) : 1) - 1) * 16)
				.select(['id'])
		} catch (e) {
			count = (
				await knex('bots')
					.where('name', 'LIKE', `%${query}%`)
					.orWhere('intro', 'LIKE', `%${query}%`)
					.orWhere('desc', 'LIKE', `%${query}%`)
					.orderBy('votes', 'desc')
					.orderBy('servers', 'desc')
					.count()
			)[0]['count(*)']

			res = await knex('bots')
				.where('name', 'LIKE', `%${query}%`)
				.orWhere('intro', 'LIKE', `%${query}%`)
				.orWhere('desc', 'LIKE', `%${query}%`)
				.orderBy('votes', 'desc')
				.orderBy('servers', 'desc')
				.limit(16)
				.offset(((page ? Number(page) : 1) - 1) * 16)
				.select(['id'])
		}
	} else {
		count = 1
		res = []
	}

	return { type, data: (await Promise.all(res.map(async el => await getBot(el.id)))).map(r=> ({...r})), currentPage: page, totalPage: Math.ceil(Number(count) / 16) }
}

async function getImage(url: string):Promise<Stream> {
	const res = await fetch(url)
	if(!res.ok) return null
	// const buf = await res.buffer()
	// const readable = bufferToStream(buf)
	// await readable.read()
	const cache = new StreamCache()
	return res.body.pipe(cache)
}

async function getDiscordUser(id: string):Promise<DiscordUser> {
	return DiscordBot.users.cache.get(id) ?? await DiscordBot.users.fetch(id, false, true).then(u => u).catch(()=>null)
}

async function addRequest(ip: string, map: TLRU<unknown, number>) {
	if(!map.has(ip)) map.set(ip, 0)
	map.set(ip, map.get(ip) + 1)
}

export const get = {
	discord: {
		user: new DataLoader(
			async (ids: string[]) =>
				(await Promise.all(ids.map(async (id: string) => await getDiscordUser(id))))
			, { cacheMap: new TLRU({ maxStoreSize: 5000, maxAgeMs: 43200000 }) }),
	},
	bot: new DataLoader(
		async (ids: string[]) =>
			(await Promise.all(ids.map(async (el: string) => await getBot(el)))).map(row => ({ ...row }))
		, { cacheMap: new TLRU({ maxStoreSize: 50, maxAgeMs: 60000 }) }),
	_rawBot: new DataLoader(
		async (ids: string[]) =>
			(await Promise.all(ids.map(async (el: string) => await getBot(el, false)))).map(row => ({ ...row }))
		, { cacheMap: new TLRU({ maxStoreSize: 50, maxAgeMs: 60000 }) }),
	user: new DataLoader(
		async (ids: string[]) =>
			(await Promise.all(ids.map(async (el: string) => await getUser(el)))).map(row => ({ ...row }))
		, { cacheMap: new TLRU({ maxStoreSize: 50, maxAgeMs: 60000 }) }),
	_rawUser: new DataLoader(
		async (ids: string[]) =>
			(await Promise.all(ids.map(async (el: string) => await getUser(el, false)))).map(row => ({ ...row }))
		, { cacheMap: new TLRU({ maxStoreSize: 50, maxAgeMs: 60000 }) }),
	list: {
		votes: new DataLoader(
			async (pages: number[]) =>
				(await Promise.all(pages.map(async (page: number) => await getBotList('VOTE', page)))).map(row => ({ ...row }))
			, { cacheMap: new TLRU({ maxStoreSize: 50, maxAgeMs: 600000 }) }),
		new: new DataLoader(
			async (pages: number[]) =>
				(await Promise.all(pages.map(async (page: number) => await getBotList('NEW', page)))).map(row => ({ ...row }))
			, { cacheMap: new TLRU({ maxStoreSize: 50, maxAgeMs: 1800000 }) }),
		trusted: new DataLoader(
			async (pages: number[]) =>
				(await Promise.all(pages.map(async (page: number) => await getBotList('TRUSTED', page)))).map(row => ({ ...row }))
			, { cacheMap: new TLRU({ maxStoreSize: 50, maxAgeMs: 3600000 }) }),
	},
	images: {
		user: new DataLoader(
			async (urls: string[]) =>
				(await Promise.all(urls.map(async (url: string) => await getImage(url))))
			, { cacheMap: new TLRU({ maxStoreSize: 5000, maxAgeMs: 43200000 }) }),
	}
}

export const ratelimit = {
	image: (ip: string) => {
		addRequest(ip, imageRateLimit)
		return imageRateLimit.get(ip)
	}
}