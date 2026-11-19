// Proof fixture for the built-in C# profile (SCOPE-137 FR-014, SC-8).
//
// Proving it lets an adapter that reads C# through this profile (dotnet-wpf, or a
// generated ASP.NET Core adapter) state `**Links proof:** passed`, after which its
// links are Confirmed instead of Likely. Expectations are written as the profile's
// claims; prove.mjs checks the links exist whatever label the run gives them.

// [SCOPE 137 / T015] BEGIN — C# profile proof fixture (FR-014)
export const fixture = {
  name: 'csharp',
  profile: 'csharp',
  files: {
    'Api/Controllers/ItemsController.cs': [
      'using Shop.Data;',
      '[Route("api/items")]',
      'public class ItemsController : ControllerBase {',
      '  [HttpGet("{id}")]',
      '  public Item Get(int id) => _db.Items.Find(id);',
      '}',
      '',
    ].join('\n'),
    'Api/Services/ItemWriter.cs': [
      'using Shop.Data;',
      'public class ItemWriter {',
      '  public void Save(Item i) { _db.Items.Add(i); var k = Environment.GetEnvironmentVariable("SHOP_KEY"); }',
      '}',
      '',
    ].join('\n'),
    'Api/Services/ItemReport.cs': 'public class ItemReport { public object All() => _db.Database.SqlQuery("SELECT * FROM items"); }\n',
    'Api/Data/ShopContext.cs': 'namespace Shop.Data { public class ShopContext : DbContext { public DbSet<Item> Items { get; set; } } }\n',
    'Api/Billing.cs': 'public class Billing { string k = Environment.GetEnvironmentVariable("SHOP_KEY"); }\n',
    'web/src/Items.tsx': 'export const I = () => fetch(`/api/items/${id}`);\n',
  },
  cases: [
    {
      name: 'an endpoint change reaches the client calling it',
      changed: ['Api/Controllers/ItemsController.cs'],
      expect: [{ type: 'url-route', direction: 'dependent', to: 'web/src/Items.tsx' }],
    },
    {
      name: 'a writer reaches the code reading the same table, and env vars link services sharing them',
      changed: ['Api/Services/ItemWriter.cs'],
      expect: [
        { type: 'table', direction: 'dependent', to: 'Api/Services/ItemReport.cs' },
        { type: 'named-string', direction: 'dependent', to: 'Api/Billing.cs' },
      ],
    },
  ],
  // Not claimed by this profile: C# `using` names a namespace, not a file, so
  // import links between C# files are not proven here and stay out of the claim.
};
// [SCOPE 137 / T015] END
