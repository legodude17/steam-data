'use strict';

var csv = require('csv');
var yargs = require('yargs');
var helpers = require('yargs/helpers');
var fs = require('fs/promises');
var fs$1 = require('fs');
var path = require('path');
var got = require('got');
var formdataNode = require('formdata-node');
var puppeteer = require('puppeteer');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n["default"] = e;
  return Object.freeze(n);
}

var csv__namespace = /*#__PURE__*/_interopNamespace(csv);
var yargs__default = /*#__PURE__*/_interopDefaultLegacy(yargs);
var fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);
var path__default = /*#__PURE__*/_interopDefaultLegacy(path);
var got__default = /*#__PURE__*/_interopDefaultLegacy(got);

// eslint-disable-next-line import/no-unresolved

async function getSteamId(url, key) {
  const splitUrl = url.split('/');
  if (splitUrl.includes('profiles')) return splitUrl[4];
  if (splitUrl.includes('id')) {
    return (
      await got__default["default"]('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/', {
        searchParams: {
          key,
          vanityurl: splitUrl[4]
        }
      }).json()
    ).response.steamid;
  }
  throw new Error('Uknown URL');
}

async function getBasicInfo(steamId, key) {
  return (
    await got__default["default"]('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/', {
      searchParams: {
        key,
        steamids: steamId
      }
    }).json()
  ).response.players[0];
}

async function getWorkshopInfo(steamId, key) {
  return (
    await got__default["default"]('https://api.steampowered.com/IPublishedFileService/GetUserFiles/v1/', {
      searchParams: {
        key,
        steamid: steamId,
        numperpage: 500,
        return_vote_data: true
      }
    }).json()
  ).response.publishedfiledetails;
}

async function getWorkshopDetails(items, key) {
  const body = new formdataNode.FormData();
  body.set('itemcount', items.length);
  body.set('key', key);
  items.forEach((item, i) => body.set(`publishedfileids[${i}]`, item));
  return (
    await got__default["default"].post('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
      body
    }).json()
  ).response.publishedfiledetails;
}

async function getVoteData(item, author, key) {
  const info = (await getWorkshopInfo(author, key))
    .filter(info => +info.publishedfileid === item)[0];
  return info.vote_data;
}

async function getAdditionalData(item, page, key) {
  const info = {};
  const url = `https://steamcommunity.com/sharedfiles/filedetails/?id=${item}`;
  await page.setViewport({ width: 1080, height: 920 });
  await page.goto(url, { waitUntil: 'networkidle2' });
  info.comment_count = parseInt(await (
    await (
      await page.$$('.tabCount')
    )[1].getProperty('innerHTML')
  ).jsonValue(), 10);
  info.update_count = parseInt((
    await (
      await (
        await page.$('.detailsStatNumChangeNotes')
      ).getProperty('innerText')
    ).jsonValue()
  ).split(' ')[0], 10);
  info.contributors = [];
  const urls = await Promise.all((await page.$$('.friendBlockLinkOverlay'))
    .map(async elm => (await elm.getProperty('href')).jsonValue()));
  const ids = await Promise.all(urls.map(url => getSteamId(url, key)));
  info.contributors = await Promise.all(ids.map(id => getBasicInfo(id, key)));
  return info;
}

async function getItem(item, key) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const info = {
    ...(await getWorkshopDetails([item], key))[0],
    ...(await getAdditionalData(item, page, key))
  };
  await browser.close();
  delete info.tags;
  delete info.description;
  info.vote_data = await getVoteData(item, info.contributors[0].steamid, key);
  return info;
}

async function* getItems(author, key) {
  const steamId = typeof author === 'string' ? await getSteamId(author, key) : author;
  const infos = await getWorkshopInfo(steamId, key);
  const details = await getWorkshopDetails(infos.map(info => info.publishedfileid), key);
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  for (let i = 0; i < infos.length; i++) {
    const item = {
      ...infos[i],
      ...details[i],
      // eslint-disable-next-line no-await-in-loop
      ...(await getAdditionalData(infos[i].publishedfileid, page, key))
    };
    delete item.tags;
    delete item.description;
    delete item.short_description;
    yield item;
  }
  await browser.close();
}

//#! /usr/bin/env node

async function getConfig() {
  const keyPath = path__default["default"].resolve('./.config.json');
  try { await fs__default["default"].access(keyPath); } catch (e) {
    console.error(`No file found at ${keyPath}`);
    return {};
  }
  return JSON.parse(await fs__default["default"].readFile(keyPath, 'utf-8'));
}

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
}

function createRecord(item) {
  return [
    item.publishedfileid,
    item.title,
    item.views,
    item.subscriptions,
    item.lifetime_subscriptions,
    item.favorited,
    item.lifetime_favorited,
    item.vote_data.votes_up,
    item.vote_data.votes_down,
    formatBytes(item.file_size),
    item.update_count,
    item.comment_count,
    new Date(item.time_created * 1000).toLocaleDateString(),
    item.contributors.map(c => c.personaname).join(';')
  ];
}

async function run() {
  const config = await getConfig();
  yargs__default["default"](helpers.hideBin(process.argv))
    .option('key', {
      alias: 'k',
      type: 'string',
      description: 'Steam API key',
      default: config.key
    })
    .option('file', {
      alias: 'f',
      type: 'string',
      description: 'Path to CSV file',
      default: config.file
    })
    .command({
      command: 'add [item]',
      desc: 'Add the specified item to the file',
      builder: yargs => yargs.positional('item', { describe: 'Item ID to add' }).demandOption('item'),
      handler: async argv => {
        const file = path__default["default"].resolve(argv.file);
        const contents = await fs__default["default"].readFile(file, 'utf-8');
        const stringer = csv__namespace.stringify();
        stringer.pipe(fs$1.createWriteStream(file));
        for await (const record of csv__namespace.parse(contents)) {
          stringer.write(record);
        }
        const item = await getItem(argv.item, argv.key);
        stringer.write(createRecord(item));
        stringer.end();
      }
    })
    .command({
      command: 'addall [user]',
      desc: 'Add all items belonging to the specified user to the file',
      builder: yargs => yargs.positional('user', { describe: 'User URL' }).demandOption('user'),
      handler: async argv => {
        const file = path__default["default"].resolve(argv.file);
        const contents = await fs__default["default"].readFile(file, 'utf-8');
        const stringer = csv__namespace.stringify();
        stringer.pipe(fs$1.createWriteStream(file));
        for await (const record of csv__namespace.parse(contents)) {
          stringer.write(record);
        }
        for await (const item of getItems(argv.user, argv.key)) {
          stringer.write(createRecord(item));
        }
        stringer.end();
      }
    })
    .command({
      command: 'remove [item]',
      desc: 'Remove the specified item from the file',
      builder: yargs => yargs.positional('item', { describe: 'Item ID to remove' }).demandOption('item'),
      handler: async argv => {
        const file = path__default["default"].resolve(argv.file);
        const contents = await fs__default["default"].readFile(file, 'utf-8');
        const stringer = csv__namespace.stringify();
        stringer.pipe(fs$1.createWriteStream(file));
        for await (const record of csv__namespace.parse(contents)) {
          if (+record[0] !== +argv.item) stringer.write(record);
        }
        stringer.end();
      }
    })
    .command({
      command: 'list',
      desc: 'List all items in the file',
      handler: async argv => {
        for await (const record of csv__namespace.parse(await fs__default["default"].readFile(path__default["default"].resolve(argv.file), 'utf-8'))) {
          console.info(`${record[0]}: ${record[1]}`);
        }
      }
    })
    .demandCommand()
    .parse();
}

run();
