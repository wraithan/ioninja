---
title: Using Build Scripts with Rust
publishDate: 2015-06-14
---

Last week I started into writing another [Warlight AI Challenge](http://theaigames.com/competitions/warlight-ai-challenge-2) bot. I definitely wanted to write the bot in Rust since it was now 1.0 and it makes sense to get the competition runners to support it. I had already written one bot in Node but wanted to see what the static approach (especially with Rust's ownership model) would yield.

I wanted to import the test harness that [Curious Attempt Bunny](http://curiousattemptbunny.com/) came up with when building his clojure bot. The [spec](https://github.com/curious-attempt-bunny/warlight2-starterbot-clojure#create-new-tests) for the tests is simple enough and it makes the tests portable across engines. This means I can import my tests from [ZenWarBot](https://github.com/wraithan/zenwarbot/tree/master/test/fodder) to bootstrap my new bot [rust-war-bot](https://github.com/wraithan/rust-war-bot). The first problem I ran into though was that there was no way to dynamically define tests for `cargo test` to pick up and run.

I found my way over to [#rust on irc.mozilla.org](http://chat.mibbit.com/?server=irc.mozilla.org&channel=%23rust) and someone suggested the because the [docs for build scripts](http://doc.crates.io/build-script.html#case-study:-code-generation) mentioned dynamically generating code then importing it. This seemed like the ticket for me.

I added `build = "build.rs"` to my Cargo.toml file and then opened `build.rs` up and pasted in the example code from the docs.

``` rust
// build.rs

use std::env;
use std::fs::File;
use std::io::Write;
use std::path::Path;

fn main() {
    let out_dir = env::var("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("hello.rs");
    let mut f = File::create(&dest_path).unwrap();

    f.write_all(b"
        pub fn message() -> &'static str {
            \"Hello, World!\"
        }
    ").unwrap();
}
```

Note this is being built as an executable and therefore needs a `fn main()`. This loads in an environment variable that Cargo sets before running your build script. `OUT_DIR` as its name implies is where all build output should be placed. This `OUT_DIR` variable is also available to your application or library while it is being build as we'll see in their example:

``` rust
// src/main.rs

include!(concat!(env!("OUT_DIR"), "/hello.rs"));

fn main() {
    println!("{}", message());
}
```

Which uses `env!` to load in the environment variable, `concat!` to load in the file, then `include!` to output the string it was handed into the file. This is all well and good and you could have read it in the docs as well, but I want to reference it as a starting point that I moved from then added onto.

My goal was to load in the names of all the files matching a pattern in a specific folder and create a test for each of them. To make this easier I decided to use the [glob](https://crates.io/crates/glob) crate. So I added it to my Cargo.toml under `[dependencies]` and then added `extern crate glob;` to my `build.rs` but it didn't build. `build.rs` couldn't find the glob crate!

It turns out that if I'd read the whole page for build scripts instead of just the section that had directly what I wanted, I would have known that [`build-dependencies`](http://doc.crates.io/build-script.html#build-dependencies) was what I wanted. So adding it there totally worked and I was trucking along.

I built out my `build.rs` to load in the file names and write out tests like so:

``` rust
// build.rs

extern crate glob;

use std::env;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use glob::glob;


fn main() {
    let out_dir = env::var("OUT_DIR").unwrap();
    // changed to tests.rs
    let dest_path = Path::new(&out_dir).join("tests.rs");
    let mut f = File::create(&dest_path).unwrap();

    for path in glob("tests/fodder/*.txt").unwrap() {
        writeln!(
            &mut f,
            // this is the test definition
            "#[test]\nfn {0}() {{assert!(true);}}",
            path.unwrap().file_stem().unwrap().to_str().unwrap()
        ).unwrap();
    }
}
```

So the `glob("tests/fodder/*.txt)` is pretty self explanatory. It returns a `Result<Paths, PatternError>`, I wanted my script to panic on error so I added `.unwrap()` because if that pattern fails, I want my build to fail. I iterate over the paths, grabbing the `file_stem` which is simply the portion of the file name before the extension. Then I convert it to a regular `str` from `OsStr` so it can be written to a file. Again, I'm just tossing `.unwrap()` on everything because I want this to crash on failure of any of these parts.

And I wrote a `tests/runner.rs` to import those tests which consisted entirely of:

``` rust
// tests/runner.rs

include!(concat!(env!("OUT_DIR"), "/tests.rs"));
```

Then I ran `cargo test` and sure enough it created tests for each of the specs! Next part took a little thinking. I started to write out my test logic directly into my `build.rs` but that was tedious because it was in a string so I didn't have syntax highlighting, among other troubles. Also, I had considered reading in the contents of the specs in the `build.rs` then just injecting them as strings into the test. I decided took a little bit of time and rethought things and decided that instead of doing a bunch of work in `build.rs` I'll just have it call a function with the file name in the test!

Next (and final) iteration of `build.rs` looks likes this:

``` rust
// build.rs

extern crate glob;

use std::env;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use glob::glob;


fn main() {
    let out_dir = env::var("OUT_DIR").unwrap();
    let dest_path = Path::new(&out_dir).join("tests.rs");
    let mut f = File::create(&dest_path).unwrap();

    for path in glob("tests/fodder/*.txt").unwrap() {
        writeln!(
            &mut f,
            "#[test]\nfn {0}() {{run_file(\"{0}\");}}",
            path.unwrap().file_stem().unwrap().to_str().unwrap()
        ).unwrap();
    }
}
```

The change is simply `assert!(true)` for `run_file(filename)` with the filename injected as a string.

From there it was just a simple matter of loading the file then adding test logic. I'll leave out the test logic for now and just show the file loading:

``` rust
// tests/runner.rs

use std::fs::File;
use std::io::Read;
use std::path::Path;

include!(concat!(env!("OUT_DIR"), "/tests.rs"));

fn run_file(name: &str) {
    let mut file_path = Path::new("tests/fodder").join(name);

    file_path.set_extension("txt");

    let mut file = File::open(&file_path).unwrap();

    let mut contents = String::new();
    file.read_to_string(&mut contents).unwrap();
    for raw_line in contents.split('\n') {
        // do test stuff on each line
    }
}

```

And that's it! I now had a way to use another test spec format, create a test for each one, and then run those tests. All goals accomplished and is written in and using stable Rust and Cargo.

