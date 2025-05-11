use pm64::bgm::Bgm;
use std::fs::read;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        print_help_and_exit();
    }
    match args[1].as_ref() {
        #[cfg(feature = "midly")]
        "convert" if args.len() == 4 => {
            let input = read(&args[2])?;
            let bgm = pm64::bgm::midi::to_bgm(&input)?;

            let mut output = std::fs::File::create(&args[3])?;
            bgm.encode(&mut output)?;
        }
        "listinstruments" if args.len() == 3 => {
            let input = read(&args[2])?;
            let bgm = Bgm::from_bytes(&input)?;

            for instrument in &bgm.instruments {
                println!("{:?}", instrument);
            }
        }
        _ => print_help_and_exit(),
    }
    Ok(())
}

fn print_help_and_exit() {
    eprintln!("Commands:");
    #[cfg(feature = "midly")]
    eprintln!("  convert <input.mid> <output.bgm>");
    eprintln!("  listinstruments <input.bgm>");
    std::process::exit(1);
}
