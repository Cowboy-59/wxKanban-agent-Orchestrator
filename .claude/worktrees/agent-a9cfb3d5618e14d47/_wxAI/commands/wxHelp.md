# wxHelp — wxAI Command Reference

```mermaid
flowchart TD
    subgraph Core_Workflow
        buildscope["buildscope"]
        createspecs["createspecs"]
        implement["implement"]
        dbpush["dbpush"]
    end
    subgraph Audit_Compliance
        auditrun["audit-run"]
        auditreport["audit-report"]
        auditcheck["audit-check"]
        audittasks["audit-tasks"]
    end
    subgraph Utilities
        lifecycle["lifecycle"]
        qa["qa"]
        help["wxHelp"]
        config["config"]
        validate["validate"]
        taskanalyze["task-analyze"]
        gateway["gateway"]
        clearcontext["clearcontext"]
        webconfig["web-config"]
        cleanup["cleanup"]
        gitcommit["git-commit"]
        gitpush["git-push"]
        gitmergemain["git-merge-main"]
        gitbranch["git-branch"]
    end
    subgraph MCP_Project_Ops
        push["push"]
        upsert["upsert"]
        createtask["createtask"]
        updatestatus["updatestatus"]
        link["link"]
        list["list"]
    end
    subgraph Project_Kit
        kitstatus["kitstatus"]
        downloadkit["downloadkit"]
        regeneratekit["regeneratekit"]
        importproject["importproject"]
        newproject["new-project"]
    end
    subgraph AI_Governance
        scopecheck["scope-check"]
        todoimport["todo-import"]
        training["training"]
        syncglobal["sync-global"]
        sessionstart["session-start"]
        validatescope["validatescope"]
        checkupdates["checkupdates"]
        upgrade["upgrade"]
    end
    subgraph Architecture
        analyzecode["analyzecode"]
    end
    subgraph Conversion
        wxconversion["wxConversion"]
        wxconversionscope["wxConversionScope"]
        cwconversion["cwConversion"]
        cwconversionscope["cwConversionScope"]
        vbconversion["vbConversion"]
        vbconversionscope["vbConversionScope"]
    end
    wxconversion --> wxconversionscope --> createspecs
    cwconversion --> cwconversionscope --> createspecs
    vbconversion --> vbconversionscope --> createspecs
    buildscope --> createspecs --> implement --> dbpush
    auditrun --> auditreport --> auditcheck --> audittasks
    kitstatus --> downloadkit --> regeneratekit --> importproject --> newproject
    scopecheck --> todoimport --> training --> syncglobal --> sessionstart --> validatescope --> checkupdates --> upgrade
```

---

## wxAI Command List

- buildscope — Guided scope drafting
- createspecs — Create specs and enforce test plan
- implement — Execute implementation plan
- dbpush — Validate and push all data to database
- audit-run, audit-report, audit-check, audit-tasks — Audit and compliance
- lifecycle, qa, help (wxHelp), config, validate, task-analyze, gateway, clearcontext, web-config, cleanup, git-commit, git-push, git-merge-main, git-branch — Utilities
- push, upsert, createtask, updatestatus, link, list — MCP Project Ops
- kitstatus, downloadkit, regeneratekit, importproject, new-project — Project Kit
- scope-check, todo-import, training, sync-global, session-start, validatescope, checkupdates, upgrade — AI Governance
- analyzecode — Architecture (wxICA drift audit + deepening exploration)
- wxConversion — WinDev/WebDev conversion stage 1 (PCSoft technical-doc PDF → readable Markdown under pre-convert/ + regenerated pages; Design stage)
- wxConversionScope — WinDev/WebDev conversion stage 2 (turn the converted artifacts into Scope-of-Project docs, BuildScope-style + resumable; Design stage)
- cwConversion — Clarion conversion stage 1 (SoftVelocity/PCSoft TXA/TXD/.clw source → readable Markdown under pre-convert/ + regenerated windows + DB schema with real FKs; Design stage)
- cwConversionScope — Clarion conversion stage 2 (turn the converted artifacts into Scope-of-Project docs, BuildScope-style + resumable, Clarion-aware gap-pass; Design stage)
- vbConversion — Visual Basic 6 conversion stage 1 (.vbp/.frm/.bas/.cls source → readable Markdown under pre-convert/ + regenerated forms + reconstructed DB model; Design stage)
- vbConversionScope — Visual Basic 6 conversion stage 2 (turn the converted artifacts into Scope-of-Project docs, BuildScope-style + resumable, VB6-aware gap-pass; Design stage)

> For details on each command, see the full help.md or run `wxai help <command>`.
