#! /usr/bin/env node
/* eslint-disable no-console */
import * as csv from 'csv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import path from 'path';
// eslint-disable-next-line import/extensions
import { getItem, getItems } from './index.js';

async function getConfig() {
  const keyPath = path.resolve('./.config.json');
  try { await fs.access(keyPath); } catch (e) {
    console.error(`No file found at ${keyPath}`);
    return {};
  }
  return JSON.parse(await fs.readFile(keyPath, 'utf-8'));
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
  yargs(hideBin(process.argv))
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
        const file = path.resolve(argv.file);
        const contents = await fs.readFile(file, 'utf-8');
        const stringer = csv.stringify();
        stringer.pipe(createWriteStream(file));
        for await (const record of csv.parse(contents)) {
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
        const file = path.resolve(argv.file);
        const contents = await fs.readFile(file, 'utf-8');
        const stringer = csv.stringify();
        stringer.pipe(createWriteStream(file));
        for await (const record of csv.parse(contents)) {
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
        const file = path.resolve(argv.file);
        const contents = await fs.readFile(file, 'utf-8');
        const stringer = csv.stringify();
        stringer.pipe(createWriteStream(file));
        for await (const record of csv.parse(contents)) {
          if (+record[0] !== +argv.item) stringer.write(record);
        }
        stringer.end();
      }
    })
    .command({
      command: 'list',
      desc: 'List all items in the file',
      handler: async argv => {
        for await (const record of csv.parse(await fs.readFile(path.resolve(argv.file), 'utf-8'))) {
          console.info(`${record[0]}: ${record[1]}`);
        }
      }
    })
    .demandCommand()
    .parse();
}

run();
