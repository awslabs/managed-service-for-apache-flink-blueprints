# run this to package up lambda 

# install dependencies in folder
pip install -r requirements.txt -t dependencies

cd dependencies

zip -r ../my-deployment.zip .;

cd ../

zip my-deployment.zip lambda_function.py

zip my-deployment.zip cfnresponse.py