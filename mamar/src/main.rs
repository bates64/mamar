use std::{
    path::PathBuf,
    fs::File,
    io::Write,
};
use structopt::StructOpt;
use pmbgm::Bgm;

#[derive(Debug, StructOpt)]
#[structopt(name = "mamar", about = "Paper Mario music editor")]
enum Cmd {
    Decode {
        /// Input file (BGM binary)
        #[structopt(parse(from_os_str))]
        input: PathBuf,

        /// Output file, stdout if not present
        #[structopt(parse(from_os_str))]
        output: Option<PathBuf>,
    },
}

fn main() {
    let cmd = Cmd::from_args();

    match cmd {
        Cmd::Decode { input, output } => {
            let mut input = File::open(input).unwrap();
            let bgm = Bgm::decode(&mut input).unwrap();

            let kdl = bgm.as_kdl().unwrap();

            if let Some(output) = output {
                let mut output = File::create(output).unwrap();
                write!(output, "{}", kdl).unwrap();
            } else {
                println!("{}", kdl);
            }
        },
    }
}
