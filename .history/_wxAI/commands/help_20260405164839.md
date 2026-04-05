# wxHelp — Show Available wxAI Commands

This reference provides a visual and categorized list of all available wxAI commands for the wxKanban Project Hub.

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
        sessionstart["session-start"]
        validatescope["validatescope"]
        checkupdates["checkupdates"]
        upgrade["upgrade"]
    end
    buildscope --> createspecs --> implement --> dbpush
    auditrun --> auditreport --> auditcheck --> audittasks
    kitstatus --> downloadkit --> regeneratekit --> importproject --> newproject
    scopecheck --> todoimport --> training --> sessionstart --> validatescope --> checkupdates --> upgrade
```

---

## wxAI Command List

- buildscope — Guided scope drafting
- createspecs — Create specs and enforce test plan
- implement — Execute implementation plan
- dbpush — Validate and push all data to database
- audit-run, audit-report, audit-check, audit-tasks — Audit and compliance
- lifecycle, qa, help (wxHelp), config, validate, task-analyze, gateway, clearcontext, web-config, cleanup, git-commit, git-push, git-merge-main, git-branch — Utilities
- kitstatus, downloadkit, regeneratekit, importproject, new-project — Project Kit
- scope-check, todo-import, training, session-start, validatescope, checkupdates, upgrade — AI Governance

> For details on each command, see the full help.md or run `wxHelp <command>`.
