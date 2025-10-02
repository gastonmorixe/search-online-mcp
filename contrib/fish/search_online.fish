function search_online --description 'Standardized search tool (Brave default) with text/JSON/NDJSON/raw outputs + schema/tooldef'
    # Usage:
    #   search_online [OPTIONS] QUERY...
    # Options:
    #   -e/--engine: search engine (default: brave)
    #   -v/--vertical: web (default), news, videos, images, etc.
    #   -k/--key: API key (or set BRAVE_SEARCH_PYTHON_CLIENT_API_KEY)
    #   -o/--output: json (default), ndjson, text, raw, schema, tooldef
    #   -L/--limit: number of results (engine-dependent; Brave max 20)
    #   -O/--offset: starting offset (engine-dependent)
    #   -C/--country: engine-specific country/region (e.g., US)
    #   -l/--lang: search language (e.g., en)
    #   -M/--market: UI language/market (e.g., en-US)
    #   -n/--no-color: no ANSI colors (text mode only)
    #   -h/--help: show help
    argparse -n search_online \
        'e/engine=' \
        'v/vertical=' \
        'k/key=' \
        'o/output=' \
        'L/limit=' \
        'O/offset=' \
        'C/country=' \
        'l/lang=' \
        'M/market=' \
        'n/no-color' \
        'h/help' -- $argv
    if test $status -ne 0
        return 2
    end
    if set -q _flag_h
        echo "Usage: search_online [OPTIONS] QUERY..."
        echo "  -e/--engine ENGINE        (default: brave)"
        echo "  -v/--vertical VERTICAL    web|news|images|videos (default: web)"
        echo "  -k/--key API_KEY          or set BRAVE_SEARCH_PYTHON_CLIENT_API_KEY"
        echo "  -o/--output FORMAT        json|ndjson|text|raw|schema|tooldef (default: json)"
        echo "  -L/--limit N              results to return (Brave max 20)"
        echo "  -O/--offset N             offset to start from"
        echo "  -C/--country CC           country/region (e.g., US)"
        echo "  -l/--lang LL              search language (e.g., en)"
        echo "  -M/--market LL-CC         UI language/market (e.g., en-US)"
        echo "  -n/--no-color             disable ANSI colors (text only)"
        return 0
    end

    set -l engine brave
    if set -q SEARCH_ONLINE_ENGINE
        set engine $SEARCH_ONLINE_ENGINE
    end
    if set -q _flag_e
        set engine $_flag_e
    end
    set -l vertical web
    if set -q _flag_v
        set vertical $_flag_v
    end

    set -l output json
    if set -q _flag_o
        set output $_flag_o
    end
    if not contains -- $output text json ndjson raw schema tooldef
        echo "Error: --output must be one of: text, json, ndjson, raw, schema, tooldef" >&2
        return 2
    end

    set -l api_key
    if set -q _flag_k
        set api_key $_flag_k
    else if set -q BRAVE_SEARCH_PYTHON_CLIENT_API_KEY
        set api_key $BRAVE_SEARCH_PYTHON_CLIENT_API_KEY
    end

    # Print standardized response schema (no query required)
    if test "$output" = schema
        printf '%s\n' '{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "search_online.response",
  "type": "object",
  "properties": {
    "engine": {"type": "string"},
    "vertical": {"type": "string"},
    "query": {"type": "string"},
    "fetched_at": {"type": "string", "format": "date-time"},
    "results": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "rank": {"type": "integer", "minimum": 1},
          "title": {"type": "string"},
          "url": {"type": "string"},
          "snippet": {"type": "string"},
          "snippet_html": {"type": "string"},
          "site_name": {"type": ["string", "null"]},
          "site_url": {"type": ["string", "null"]},
          "favicon_url": {"type": ["string", "null"]},
          "thumbnail_url": {"type": ["string", "null"]},
          "published_at": {"type": ["string", "null"]},
          "age": {"type": ["string", "null"]},
          "content_type": {"type": ["string", "null"]},
          "sitelinks": {
            "type": "array",
            "items": {"type": "object", "properties": {"title": {"type":"string"}, "url": {"type": "string"}}, "required": ["title", "url"]}
          }
        },
        "required": ["rank", "title", "url"]
      }
    }
  },
  "required": ["engine", "vertical", "query", "fetched_at", "results"]
}'
        return 0
    end

    # Print tool definition (function schema) for AI agents (no query required)
    if test "$output" = tooldef
        printf '%s\n' '{
  "type": "function",
  "function": {
    "name": "search_online",
    "description": "Search the web/news/images/videos via multiple engines (Brave by default) and return standardized results.",
    "parameters": {
      "type": "object",
      "properties": {
        "query": {"type": "string", "description": "Search query string."},
        "vertical": {"type": "string", "enum": ["web", "news", "images", "videos"], "default": "web"},
        "engine": {"type": "string", "enum": ["brave"], "default": "brave"},
        "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 20},
        "offset": {"type": "integer", "minimum": 0, "default": 0},
        "output": {"type": "string", "enum": ["json", "ndjson", "raw"], "default": "json"},
        "country": {"type": "string", "description": "Region/Country code (e.g., US)."},
        "lang": {"type": "string", "description": "Search language (e.g., en)."},
        "market": {"type": "string", "description": "UI language/market (e.g., en-US)."}
      },
      "required": ["query"]
    }
  }
}'
        return 0
    end

    if test (count $argv) -eq 0
        echo "Usage: search_online [OPTIONS] QUERY..." >&2
        return 2
    end

    set -l query (string join ' ' -- $argv)
    set -l fetched_at (date -u +"%Y-%m-%dT%H:%M:%SZ")

    # Build engine command
    # base_cmd will be constructed per engine below
    if set -q SEARCH_ONLINE_DEBUG
        echo "DEBUG search_online: engine=$engine vertical=$vertical output=$output" 1>&2
    end
    switch $engine
        case brave
            if test -z "$api_key"
                echo "Error: BRAVE_SEARCH_PYTHON_CLIENT_API_KEY not set. Use -k or export it." >&2
                return 1
            end
            if set -q SEARCH_ONLINE_DEBUG
                echo "DEBUG: constructing Brave command" 1>&2
            end
            set -g __search_online_base_cmd env NO_COLOR=1 BRAVE_SEARCH_PYTHON_CLIENT_API_KEY=$api_key \
                uvx --with psutil --with httpx \
                brave-search-python-client $vertical
            if set -q _flag_L
                set -a __search_online_base_cmd --count $_flag_L
            end
            if set -q _flag_O
                set -a __search_online_base_cmd --offset $_flag_O
            end
            if set -q _flag_C
                set -a __search_online_base_cmd --country $_flag_C
            end
            if set -q _flag_l
                set -a __search_online_base_cmd --search-lang $_flag_l
            end
            if set -q _flag_M
                set -a __search_online_base_cmd --ui-lang $_flag_M
            end
            set -a __search_online_base_cmd "$query"
        case '*'
            echo "Error: unsupported engine: $engine" >&2
            return 2
    end

    switch $output
        case json
            if set -q SEARCH_ONLINE_DEBUG
                echo "DEBUG: base_cmd count=(count $__search_online_base_cmd) first=$__search_online_base_cmd[1] second=$__search_online_base_cmd[2]" 1>&2
            end
            $__search_online_base_cmd | jq -c \
                --arg engine "$engine" \
                --arg v "$vertical" \
                --arg q "$query" \
                --arg fetched "$fetched_at" '
                {
                  engine: $engine,
                  vertical: $v,
                  query: $q,
                  fetched_at: $fetched,
                  results: (.[ $v ].results // []
                    | to_entries
                    | map({
                        rank: (.key + 1),
                        title: (.value.title // ""),
                        url: (.value.url // ""),
                        snippet_html: (.value.description // ""),
                        snippet: ((.value.description // "")
                                  | gsub("<[^>]+>"; "")
                                  | gsub("&nbsp;"; " ")
                                  | gsub("&amp;"; "&")),
                        site_name: (.value.profile.long_name // .value.meta_url.hostname // null),
                        site_url: (.value.profile.url // null),
                        favicon_url: (.value.meta_url.favicon // .value.profile.img // null),
                        thumbnail_url: (.value.thumbnail.src // null),
                        published_at: (.value.page_age // null),
                        age: (.value.age // null),
                        content_type: (.value.subtype // .value.content_type // null),
                        sitelinks: ((.value.cluster // []) | map({title, url}))
                    })
                  )
                }'
        case ndjson
            $__search_online_base_cmd | jq -c \
                --arg engine "$engine" \
                --arg v "$vertical" \
                --arg q "$query" \
                --arg fetched "$fetched_at" '
                (.[ $v ].results // []
                 | to_entries[]
                 | {
                    engine: $engine,
                    vertical: $v,
                    query: $q,
                    fetched_at: $fetched,
                    rank: (.key + 1),
                    title: (.value.title // ""),
                    url: (.value.url // ""),
                    snippet_html: (.value.description // ""),
                    snippet: ((.value.description // "")
                              | gsub("<[^>]+>"; "")
                              | gsub("&nbsp;"; " ")
                              | gsub("&amp;"; "&")),
                    site_name: (.value.profile.long_name // .value.meta_url.hostname // null),
                    site_url: (.value.profile.url // null),
                    favicon_url: (.value.meta_url.favicon // .value.profile.img // null),
                    thumbnail_url: (.value.thumbnail.src // null),
                    published_at: (.value.page_age // null),
                    age: (.value.age // null),
                    content_type: (.value.subtype // .value.content_type // null),
                    sitelinks: ((.value.cluster // []) | map({title, url}))
                 }
                )'
        case raw
            # Pass-through raw engine response
            $__search_online_base_cmd
        case text
            set -l glow_cmd glow
            if set -q _flag_n
                # No color: either use glow --style=notty or bypass glow entirely
                set glow_cmd "glow --style=notty"
            end
            $__search_online_base_cmd | jq -r --arg v "$vertical" '
                (.[ $v ].results // [])[] |
                "\(.title)\n\(.description // "" | gsub("<[^>]+>"; ""))\nURL: \(.url)\n"
            ' | eval $glow_cmd
    end
end

