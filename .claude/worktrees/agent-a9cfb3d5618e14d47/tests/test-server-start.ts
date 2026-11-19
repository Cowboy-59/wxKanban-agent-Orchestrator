/**
 * Quick test to verify server components load without errors
 */

async function testServerStartup() {
  console.log('Testing server component loading...\n');
  
  try {
    // Test 1: Load config
    console.log('1. Loading config...');
    const { config } = await import('../src/server/config.js');
    console.log('   ✓ Config loaded');
    console.log(`   - API_TOKEN_ENCRYPTION_KEY: ${config.API_TOKEN_ENCRYPTION_KEY ? 'Set' : 'NOT SET'}`);
    
    // Test 2: Load encryption service
    console.log('\n2. Loading KitEncryptionService...');
    const { kitEncryptionService } = await import('../src/server/services/KitEncryptionService.js');
    console.log('   ✓ KitEncryptionService loaded');
    
    // Test 3: Load API token service
    console.log('\n3. Loading ApiTokenService...');
    const { apiTokenService } = await import('../src/server/services/ApiTokenService.js');
    console.log('   ✓ ApiTokenService loaded');
    
    // Test 4: Load kit generation service
    console.log('\n4. Loading KitGenerationService...');
    const { kitGenerationService } = await import('../src/server/services/KitGenerationService.js');
    console.log('   ✓ KitGenerationService loaded');
    
    // Test 5: Load kit routes
    console.log('\n5. Loading kit routes...');
    const kitRoutes = await import('../src/server/routes/kitRoutes.js');
    console.log('   ✓ Kit routes loaded');
    
    // Test 6: Verify database schema exports
    console.log('\n6. Loading database schemas...');
    const schemas = await import('../src/db/schema/index.js');
    console.log('   ✓ Database schemas loaded');
    console.log(`   - Exports: ${Object.keys(schemas).join(', ')}`);
    
    console.log('\n✅ All server components loaded successfully!');
    console.log('\nNext steps for full testing:');
    console.log('1. Start the server: npm run dev');
    console.log('2. Test API endpoints with curl or Postman');
    console.log('3. Create a real project and test kit generation');
    
  } catch (error: any) {
    console.error('\n❌ Server component loading failed:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
  
  process.exit(0);
}

testServerStartup();
