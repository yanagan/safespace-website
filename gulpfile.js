var gulp = require('gulp');
var uglify = require('gulp-uglify');
var htmlreplace = require('gulp-html-replace');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var browserify = require('browserify');
var watchify = require('watchify');
var babelify = require('babelify');
var streamify = require('gulp-streamify');
var sourcemaps = require('gulp-sourcemaps');
var del = require('del');
var connect = require('gulp-connect');
var gutil = require('gulp-util');
var chalk = require('chalk');
var runSequence = require('run-sequence');
var deploy = require('gulp-gh-pages');
var minifyCss = require('gulp-minify-css');
var autoprefixer = require('gulp-autoprefixer');
var sass = require('gulp-sass');
var gulpif = require('gulp-if');
var argv = require('yargs').argv;
var awspublish = require('gulp-awspublish');
var merge = require('merge-stream');
var fs = require('fs');
var slm = require('gulp-slm');

var production = !!argv.production;

var path = {
  HTML: 'src/**/*.html',
  SLM: 'src/**/*.slm',
  STATIC: ['src/**/*.{html,png,jpg,ttf,woff,eof,svg}'],
  JS_MINIFIED_OUT: 'app.min.js',
  JS_OUT: 'app.js',
  CSS_OUT: 'app.css',
  DEST: 'dist',
  DEST_CSS: 'dist/css',
  DEST_JS: 'dist/js',
  DEST_SRC: 'dist/src',
  ENTRY_POINT: './src/js/app.js'
};

gulp.task('clean', function() {
  return del([path.DEST + '/**/*']);
});

gulp.task('slm', function() {
  return gulp.src(path.SLM)
    .pipe(slm())
    .pipe(gulp.dest(path.DEST))
    .pipe(connect.reload());
});

gulp.task('copy', function() {
  return gulp.src(path.STATIC)
    .pipe(gulp.dest(path.DEST))
    .pipe(connect.reload());
});

gulp.task('css', function() {
  return gulp.src('src/css/*.scss')
    .pipe(gulpif(!production, sourcemaps.init()))
    .pipe(sass({
      sourceComments: !production,
      outputStyle: production ? 'compressed' : 'nested'
    }))
    .on('error', handleError)
    .pipe(gulpif(!production, sourcemaps.write({
      includeContent: false,
      sourceRoot: '.'
    })))
    .pipe(gulpif(!production, sourcemaps.init({
      loadMaps: true
    })))
    .pipe(autoprefixer({ browsers: 'last 2 versions' }))
    .pipe(sourcemaps.write({
      includeContent: true
    }))
    .pipe(gulp.dest(path.DEST_CSS))
    .pipe(gulpif(!production, connect.reload()));
});

function handleError(error) {
  if (error.filename) {
    gutil.log(chalk.red(error.name) + " in " + chalk.white(error.filename.replace(
        __dirname + "/src/", "")) + ": Line " + chalk.magenta(error.loc.line) +
      " & Column " + chalk.magenta(error.loc.column) + " Message: " +
      chalk.yellow(error.message));
  } else {
    gutil.log(chalk.red(error.name) + ": " + chalk.yellow(error.message));
  }
  this.emit('end');
}

gulp.task('watch', function() {
  gulp.watch(path.SLM, ['slm']);
  gulp.watch(path.STATIC, ['copy']);
  gulp.watch('src/css/*.scss', ['css']);

  var watcher  = watchify(browserify({
    entries: [path.ENTRY_POINT],
    transform: [babelify],
    debug: true,
    cache: {}, packageCache: {}, fullPaths: true
  }));

  return watcher.on('update', function(file) {
    if (file) {
      gutil.log("Recompiling " + file[0].replace(__dirname + "/src/",""));
    }

    watcher.bundle()
      .on('error', handleError)
      .pipe(source(path.JS_OUT))
      .pipe(buffer())
      .pipe(sourcemaps.init({ loadMaps: true }))
      .pipe(sourcemaps.write(path.DEST_SRC))
      .pipe(gulp.dest(path.DEST_SRC))
      .pipe(connect.reload());
  }).bundle()
    .on('error', handleError)
    .pipe(source(path.JS_OUT))
    .pipe(buffer())
    .pipe(sourcemaps.init({ loadMaps: true }))
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest(path.DEST_SRC))
    .pipe(connect.reload());
});

gulp.task('build', function() {
  return browserify({
    entries: [path.ENTRY_POINT],
    transform: [babelify],
  }).bundle()
    .on('error', handleError)
    .pipe(source(path.JS_MINIFIED_OUT))
    .pipe(streamify(uglify()))
    .pipe(gulp.dest(path.DEST_JS));
});

gulp.task('replaceHTML', function() {
  return gulp.src(path.HTML)
    .pipe(htmlreplace({
      'js': 'js/' + path.JS_MINIFIED_OUT
    }))
    .pipe(gulp.dest(path.DEST));
});

gulp.task('server', function() {
  return connect.server({
    root: path.DEST,
    livereload: true
  });
});

gulp.task('production', function(callback) {
  production = true;
  runSequence('clean', 'slm', 'copy', 'replaceHTML', 'css', 'build', callback);
});

gulp.task('default', function(callback) {
  runSequence('clean', ['slm', 'copy', 'css', 'server', 'watch'], callback);
});

gulp.task('deploy:aws', function() {
  var awsConfig = JSON.parse(fs.readFileSync('./aws.json'));
  awsConfig.params = Object.assign({}, awsConfig.params, { "Bucket": "safespace.org" });
  var publisher = awspublish.create(awsConfig);
  var headers = { 'Cache-Control': 'max-age=300, no-transform, public' };
  var gzip = gulp.src(['dist/**/*.{js,css,eot,svg,ttf,woff}']).pipe(awspublish.gzip());
  var plain = gulp.src(['dist/**/*', '!dist/**/*.{js,css,eot,svg,ttf,woff}']);

  return merge(gzip, plain)
    .pipe(publisher.publish(headers))
    .pipe(publisher.sync())
    .pipe(awspublish.reporter());
});

gulp.task('deploy', function(callback) {
  runSequence('production', 'deploy:aws', callback);
});
