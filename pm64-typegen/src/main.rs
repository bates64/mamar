use typescript_type_def::*;
use pm64::bgm::Bgm;

fn main() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/pm64.d.ts");
    let mut file = std::fs::File::create(path).unwrap();

    let stats = write_definition_file::<_, Bgm>(&mut file, DefinitionFileOptions {
        header: "/* eslint-disable */".into(),
        root_namespace: None,
    }).unwrap();

    println!("Wrote {} type definitions to {}", stats.type_definitions, path);
}
