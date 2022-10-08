# steam-data-csv
> A tool to get data about steam workshop items and make a spreadsheet.

# Install

`npm i -g steam-data-csv`

# Configure

1. Create a repo to use: `mkdir test`, `cd test`
2. Create a sheet to use: `echo "Id,Title,Views,Subs,Life Subs,Favs,Life Favs,Likes,Dislikes,File Size,Update Count,Comment Count,Upload Date,Collaborators" > sheet.csv`
3. Create a Steam Web API key: https://steamcommunity.com/dev/apikey
4. Create a config file: `touch .config.json`
6. Add the following keys to your config file:
  - `"key"`: Set to the key you created
  - `"file"`: Set to the path to the file, in this case it is `sheet.csv`

# Help

`steam-data-csv help`

# Usage

`steam-data-csv add [item]`: Add a specific workshop item to the sheet, by ID

`steam-data-csv addall [user]`: Add all items from a user to the sheet, by profile URL

`steam-data-csv list`: List all items in the sheet

`steam-data-csv remove [item]`: Remove a specific item from the sheet, by ID
