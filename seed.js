const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { rejectUnauthorized: false }
    : false
});

const entries = [
  {
    title: 'The Challenger Disaster — Richard Feynman\'s Investigation',
    url: 'https://www.youtube.com/watch?v=6Rwcbsn19c0',
    type: 'video',
    tags: ['space', 'nasa', 'challenger', 'engineering'],
    review: 'Feynman\'s famous O-ring demonstration before the Rogers Commission is one of the most quietly devastating moments in the history of public accountability. A physicist drops a rubber ring in ice water and unravels years of institutional cover. Essential.',
    rating: 5
  },
  {
    title: 'Mayday: Air Crash Investigation — Überlingen Mid-Air Collision',
    url: 'https://www.youtube.com/watch?v=oHyWFP0SYIE',
    type: 'video',
    tags: ['aviation', 'atc', 'collision', 'europe'],
    review: 'Two aircraft collide over Germany in 2002 because of conflicting instructions from an automated system and a controller. The episode covers the crash but also the devastating aftermath — including the murder of the controller by a grieving father. Hard to watch, impossible to look away.',
    rating: 4
  },
  {
    title: 'Normal Accidents: Living with High-Risk Technologies — Charles Perrow',
    url: 'https://www.amazon.com/Normal-Accidents-Living-High-Risk-Technologies/dp/0691004129',
    type: 'book',
    tags: ['systems', 'theory', 'nuclear', 'engineering'],
    review: 'Perrow\'s argument is simple and unsettling: in tightly coupled, complex systems, catastrophic accidents aren\'t failures — they\'re normal. Written after Three Mile Island, it holds up uncomfortably well. Dense but worth it if you want to understand why disasters keep happening despite our best efforts.',
    rating: 5
  },
  {
    title: '99% Invisible — The Pruitt-Igoe Myth',
    url: 'https://99percentinvisible.org/episode/the-pruitt-igoe-myth/',
    type: 'podcast',
    tags: ['architecture', 'housing', 'urban', 'collapse'],
    review: 'The demolition of the Pruitt-Igoe housing project in St. Louis became shorthand for the failure of modernist architecture. This episode complicates that story considerably — the buildings weren\'t the problem. A good listen for anyone interested in how we assign blame after things fail.',
    rating: 4
  },
  {
    title: 'The Fukushima Daiichi Nuclear Disaster — Official NAIIC Report Summary',
    url: 'https://www.nirs.org/wp-content/uploads/fukushima/naiic_report.pdf',
    type: 'article',
    tags: ['nuclear', 'japan', 'fukushima', 'tsunami'],
    review: 'The National Diet\'s official investigation concluded the disaster was "profoundly manmade." The executive summary alone is worth reading — unusually frank for a government document, it names the cultural and regulatory failures directly. The full report is 88 pages but the first 20 tell you everything.',
    rating: 5
  },
  {
    title: 'Seconds from Disaster — Texas City Refinery Explosion',
    url: 'https://www.youtube.com/watch?v=XuPLkrJeN8I',
    type: 'video',
    tags: ['industrial', 'explosion', 'bp', 'texas'],
    review: 'The 2005 BP Texas City disaster killed 15 people and injured 180. This reconstruction shows how a series of normalised deviations — each individually survivable — combined into catastrophe. Good on the human factors side, though it underplays BP\'s corporate cost-cutting context.',
    rating: 3
  },
  {
    title: 'Five Thirty Eight — How Flint\'s Water Crisis Happened',
    url: 'https://fivethirtyeight.com/features/how-flints-water-crisis-happened/',
    type: 'article',
    tags: ['water', 'flint', 'infrastructure', 'public-health'],
    review: 'Data-driven reconstruction of how Flint\'s water supply became contaminated with lead. Clear on the sequence of decisions and the bureaucratic gaps that allowed it to continue. Good as a primer before going deeper into longer-form coverage.',
    rating: 3
  },
  {
    title: 'Darkstar Crashes — The Ramstein Airshow Disaster',
    url: 'https://www.spiegel.de/international/germany/revisiting-ramstein-a-look-back-at-the-1988-air-show-disaster-a-573165.html',
    type: 'article',
    tags: ['aviation', 'airshow', 'germany', 'military'],
    review: 'The 1988 Ramstein airshow crash killed 70 people when an aerobatic display went wrong over a packed crowd. Largely forgotten outside Germany. This piece revisits it with survivor testimony and asks why so little changed about airshow safety in the aftermath.',
    rating: 4
  }
];

async function seed() {
  console.log(`Inserting ${entries.length} entries...`);
  for (const entry of entries) {
    await pool.query(
      `INSERT INTO entries (id, title, url, type, tags, review, rating)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING`,
      [uuidv4(), entry.title, entry.url, entry.type, entry.tags, entry.review, entry.rating]
    );
    console.log(`  ✓ ${entry.title}`);
  }
  console.log('Done.');
  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
