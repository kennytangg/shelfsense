# Photo sources

Real photographs used by the end-to-end suite. Both are downloaded from Wikimedia Commons as 1280 px wide JPEG renditions, with no edits.

| File                                     | Source page                                                                                             | Author     | Licence                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------- |
| `trader-joes-empty-egg-shelf.jpg`        | https://commons.wikimedia.org/wiki/File:Empty_egg_shelf_in_Trader_Joes,_Palo_Alto,_CA_(2023.01)_-_1.jpg | Suiren2022 | CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0) |
| `jerusalem-empty-egg-shelf-portrait.jpg` | https://commons.wikimedia.org/wiki/File:Empty_egg_shelf_in_Jerusalem,_April_2020.jpg                    | Amire80    | CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)  |

## Why only two real photographs

The detector compares a photo with an empty reference photo of the same shelf taken from the same viewpoint. Searching Wikimedia Commons for such a series (one shelf, empty / partly stocked / full, same camera position) found none. Commons has many photos of empty shelves and many of full shelves, but not of the same shelf from the same spot.

So:

- Real photos are used where a result can be checked honestly: setting up a shelf with a real empty-shelf photo and re-photographing it (reads Empty), and a real portrait photo that must be rejected as wrong framing.
- The Full and Low steps use the repository's frozen illustrated set in `tests/fixtures/shelves/` (CC0, one shelf, one viewpoint). These are drawings, not photographs. No real photo was edited or composited to make a Full or Low result.
- Two unrelated real shelf photos with the same aspect ratio were tried as reference and current photo. The detector reported "Full" (74% coverage) because it cannot tell different shelves apart; that is not a meaningful result, so it is not asserted anywhere.
