module.exports = {
    extends: 'standard',
    plugins: [
        'mocha'
    ],
    rules: {
        'mocha/no-identical-title': ['error'],
        'mocha/no-mocha-arrows': ['error'],
        'mocha/no-nested-tests': ['error'],
        'mocha/no-pending-tests': ['warn'],
        'mocha/no-synchronous-tests': ['error', { allowed: ['async'] }]
    }
};
