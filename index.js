// eslint-disable-next-line import/no-unresolved
import got from 'got';
import { FormData } from 'formdata-node';
import { launch as launchBrowser } from 'puppeteer';

async function getSteamId(url, key) {
  const splitUrl = url.split('/');
  if (splitUrl.includes('profiles')) return splitUrl[4];
  if (splitUrl.includes('id')) {
    return (
      await got('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/', {
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
    await got('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/', {
      searchParams: {
        key,
        steamids: steamId
      }
    }).json()
  ).response.players[0];
}

async function getWorkshopInfo(steamId, key) {
  return (
    await got('https://api.steampowered.com/IPublishedFileService/GetUserFiles/v1/', {
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
  const body = new FormData();
  body.set('itemcount', items.length);
  body.set('key', key);
  items.forEach((item, i) => body.set(`publishedfileids[${i}]`, item));
  return (
    await got.post('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
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

export async function getItem(item, key) {
  const browser = await launchBrowser();
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

export async function* getItems(author, key) {
  const steamId = typeof author === 'string' ? await getSteamId(author, key) : author;
  const infos = await getWorkshopInfo(steamId, key);
  const details = await getWorkshopDetails(infos.map(info => info.publishedfileid), key);
  const browser = await launchBrowser();
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
