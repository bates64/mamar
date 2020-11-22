module.exports = {
    plugins: [
        // Imports
        require('postcss-import-ext-glob'),
        require('postcss-import')({ from: 'src/lib.css' }),

        // Extra properties
        require('postcss-short')({ skip: '_' }),

        // Extra expressions
        require('postcss-color-function'),

        // Postprocessing
        // TODO: consider https://github.com/postcss/postcss-dark-theme-class
        require('postcss-preset-env')({ stage: 0 }), // Autoprefixer, nesting, etc.
        require('postcss-csso'), // Compression
    ],
}
