use pm64::bgm::Bgm;
use pm64::sbn::Sbn;
use typescript_type_def::*;

type Api = (Bgm, Sbn);

fn main() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/pm64.d.ts");

    {
        let mut file = std::fs::File::create(path).unwrap();
        write_definition_file::<_, Api>(
            &mut file,
            DefinitionFileOptions {
                header: "/* eslint-disable */".into(),
                root_namespace: None,
            },
        )
        .unwrap();
    }

    // typescript_type_def doesn't handle flattened enums very well, so patch to fix CommandSeq
    // replace instances of `"commands": CommandSeq` in file with `"commands": Event[]`
    let content = std::fs::read_to_string(path).unwrap();
    let content = content.replace(r#""commands": CommandSeq"#, r#""commands": Event[]"#);
    std::fs::write(path, content).unwrap();

    println!("Wrote type definitions to {}", path);
}
