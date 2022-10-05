use pm64::bgm::Bgm;
use pm64::sbn::Sbn;
use typescript_type_def::*;

type Api = (Bgm, Sbn);

fn main() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/pm64.d.ts");
    let mut file = std::fs::File::create(path).unwrap();

    let stats = write_definition_file::<_, Api>(
        &mut file,
        DefinitionFileOptions {
            header: "/* eslint-disable */".into(),
            root_namespace: None,
        },
    )
    .unwrap();

    println!("Wrote {} type definitions to {}", stats.type_definitions, path);
}
