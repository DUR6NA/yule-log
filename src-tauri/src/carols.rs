//! What Gemma is asked to write. Each carol gets a random style and subject so an
//! endless run doesn't collapse into the same song forty times. Nobody reads the
//! lyrics: they're burned for heat and thrown away.

use std::collections::VecDeque;

pub const SYSTEM_PROMPT: &str = "You write original Christmas songs for a cozy Midwestern holiday radio station.
Every reply is exactly one complete song and nothing else.

Format:
Title: <the song's title>

[Verse 1]
<lyrics>

[Chorus]
<lyrics>

Use two or three verses, a chorus that repeats, and an optional bridge.
Rhyme, keep a steady singable meter, keep it warm and a little funny, and stay under 200 words.
Plain text only: no markdown, no asterisks, no notes before or after the song.";

const STYLES: &[&str] = &[
    "traditional church carol",
    "jingle-bell sleigh ride song",
    "slow crooner ballad",
    "Wisconsin polka",
    "children's sing-along",
    "Motown Christmas song",
    "country Christmas song",
    "barbershop quartet number",
    "old English wassailing song",
    "lullaby for Christmas Eve",
    "big-band swing number",
    "rock-and-roll Christmas song",
    "hymn sung in a church basement",
    "TV jingle for a Christmas special",
];

const SUBJECTS: &[&str] = &[
    "a family keeping warm by a computer that writes Christmas carols",
    "the furnace dying on the coldest night of the year",
    "lake-effect snow burying the driveway on Christmas Eve",
    "ice fishing on a frozen Minnesota lake on Christmas morning",
    "a church basement potluck with tater tot hotdish and bars",
    "shoveling the neighbor's walk before they wake up",
    "a snowplow driver working through Christmas Eve",
    "a candle left burning in a farmhouse window",
    "the best sledding hill in town",
    "Christmas lights on a farmhouse in the middle of a cornfield",
    "a space heater that thinks it is a fireplace",
    "a Yule log that burns on graphics-card heat",
    "scraping frost off the windshield at 6 a.m.",
    "grandma's kringle and a pot of strong coffee",
    "an Old Fashioned at a Wisconsin supper club on Christmas Eve",
    "the Packers playing on Christmas Day",
    "a snow day when school is cancelled",
    "Santa's sleigh getting stuck in a snowdrift outside Fargo",
    "bringing the dog in from the cold",
    "a thermostat war between Dad and everyone else",
    "wool socks, long johns, and a quilt from great-aunt Ruth",
    "a reindeer who is scared of the wind chill",
    "the electric bill arriving the week after Christmas",
    "a snowman that keeps watch over the cul-de-sac",
    "carolers singing door to door at ten below zero",
    "the first real snow of the year",
    "midnight Mass in a small town",
    "baking cutout cookies with too much frosting",
    "a gingerbread house that collapses",
    "a garage full of boots, salt, and shovels",
    "the Christmas tree farm out on County Road J",
    "hot cocoa after skating on the pond",
    "a power outage on Christmas Eve, and everyone around the fire",
    "a toboggan, three cousins, and one bad decision",
    "the North Star over a frozen prairie",
    "an old pickup truck that won't start in the cold",
];

/// How many recent subjects to avoid repeating.
const MEMORY: usize = 12;

/// The user prompt for the next carol, avoiding subjects used recently.
pub fn next_prompt(recent: &mut VecDeque<usize>) -> String {
    let style = STYLES[fastrand::usize(..STYLES.len())];
    let fresh: Vec<usize> = (0..SUBJECTS.len()).filter(|i| !recent.contains(i)).collect();
    let subject = fresh[fastrand::usize(..fresh.len())];
    recent.push_back(subject);
    if recent.len() > MEMORY {
        recent.pop_front();
    }
    format!("Write a {style} about {}.", SUBJECTS[subject])
}
