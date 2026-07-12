/**
 * Bundled quote libraries loaded from assets.
 * React Native requires static require() for bundled JSON.
 */

import { Quote } from '../types/config';
// Static imports of all bundled quote JSON files
const stoicQuotes: Quote[] = require('../../assets/quotes/augustine.json');
const biblekjv: Quote[] = require('../../assets/quotes/biblekjv.json');
const callOfDuty: Quote[] = require('../../assets/quotes/callOfDuty.json');
const charlesSpurgeon: Quote[] = require('../../assets/quotes/charlesSpurgeon.json');
const csLewis: Quote[] = require('../../assets/quotes/csLewis.json');
const inspirations: Quote[] = require('../../assets/quotes/inspirations.json');
const jamesFT: Quote[] = require('../../assets/quotes/JamesFTquotes.json');
const johnCalvin: Quote[] = require('../../assets/quotes/johnCalvin.json');
const macarthur: Quote[] = require('../../assets/quotes/macarthur.json');
const markTwain: Quote[] = require('../../assets/quotes/markTwain.json');
const martinLuther: Quote[] = require('../../assets/quotes/martinLuther.json');
const mbc: Quote[] = require('../../assets/quotes/mbc.json');
const nasrulHazim: Quote[] = require('../../assets/quotes/NasrulHazimQuotes.json');
const patton: Quote[] = require('../../assets/quotes/patton.json');
const richardBaxter: Quote[] = require('../../assets/quotes/richardBaxter.json');
const talmud: Quote[] = require('../../assets/quotes/21TalmudQuotes.json');
const willRogers: Quote[] = require('../../assets/quotes/willRogers.json');

export interface BundledLibrary {
  key: string;
  quotes: Quote[];
}

export const BUNDLED_LIBRARIES: Record<string, Quote[]> = {
  'augustine': stoicQuotes,
  'biblekjv': biblekjv,
  'callofduty': callOfDuty,
  'charlesspurgeon': charlesSpurgeon,
  'cslewis': csLewis,
  'inspirations': inspirations,
  'jamesft': jamesFT,
  'johncalvin': johnCalvin,
  'macarthur': macarthur,
  'marktwain': markTwain,
  'martinluther': martinLuther,
  'mbc': mbc,
  'nasrulhazim': nasrulHazim,
  'patton': patton,
  'richardbaxter': richardBaxter,
  'talmud': talmud,
  'willrogers': willRogers,
};
